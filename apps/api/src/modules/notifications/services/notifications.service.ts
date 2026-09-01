import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/services/prisma.service';
import { MailerService } from './mailer.service';
import {
  applicationReceived,
  applicationRejected,
  interviewScheduled,
  type RenderedMail,
} from '../templates';

/**
 * Turns an outbox event into an email.
 *
 * Recipients and content are resolved here, when the job runs, rather than
 * frozen into the payload when it was written. That is what makes a corrected
 * email address take effect, and it keeps the outbox row small enough to be
 * cheap to write inside someone else's transaction.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async deliver(eventType: string, payload: { applicationId: string; interviewId?: string }) {
    const mail = await this.render(eventType, payload);
    if (!mail) return { status: 'skipped' as const };

    await this.mailer.send(mail);
    return { status: 'sent' as const };
  }

  private async render(
    eventType: string,
    payload: { applicationId: string; interviewId?: string },
  ): Promise<({ to: string } & RenderedMail) | null> {
    const application = await this.prisma.application.findUnique({
      where: { id: payload.applicationId },
      select: {
        id: true,
        status: true,
        candidate: { select: { fullName: true, primaryEmail: true } },
        job: { select: { title: true } },
        org: { select: { name: true } },
      },
    });

    // The application was deleted between the outbox write and this job. There
    // is nobody left to notify, and failing would retry forever.
    if (!application) {
      this.logger.warn(`No application ${payload.applicationId}; nothing to send`);
      return null;
    }

    // A candidate can reach the system by phone alone, so an address is not
    // guaranteed. Nothing to send is a skip, not a failure — retrying would
    // never conjure an email address that does not exist.
    const to = application.candidate.primaryEmail;
    if (!to) {
      this.logger.warn(`Candidate on application ${application.id} has no email address`);
      return null;
    }
    if (!to) {
      this.logger.warn(`Candidate ${application.candidate.fullName} has no primaryEmail`);
      return null;
    }
    const common = {
      candidateName: application.candidate.fullName,
      jobTitle: application.job.title,
      companyName: application.org.name,
    };

    switch (eventType) {
      case 'application.received':
        return { to, ...applicationReceived(common) };

      case 'application.rejected':
        return { to, ...applicationRejected(common) };

      case 'interview.scheduled': {
        if (!payload.interviewId) return null;
        const interview = await this.prisma.interview.findUnique({
          where: { id: payload.interviewId },
          select: { title: true, scheduledStart: true, timezone: true, meetingUrl: true, status: true },
        });
        // Cancelled between scheduling and this job running. Sending a
        // confirmation for an interview that is already off is worse than
        // sending nothing.
        if (!interview || interview.status === 'CANCELLED') return null;

        return {
          to,
          ...interviewScheduled({
            candidateName: common.candidateName,
            jobTitle: common.jobTitle,
            interviewTitle: interview.title,
            startsAt: interview.scheduledStart,
            timezone: interview.timezone,
            meetingUrl: interview.meetingUrl,
          }),
        };
      }

      default:
        this.logger.warn(`No template for "${eventType}"`);
        return null;
    }
  }
}
