import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG } from '../../../config/config.module';
import type { Env } from '../../../config/env';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The one place that talks SMTP.
 *
 * Wrapped rather than used directly so the rest of the system depends on "send
 * this message" and not on nodemailer — swapping in SES or Postmark later is
 * then a change to this file alone. In development the transport points at
 * Mailpit, which accepts everything and delivers nothing.
 */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private readonly transport: Transporter | null;

  constructor(@Inject(APP_CONFIG) private readonly config: Env) {
    this.transport = config.MAIL_ENABLED
      ? createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          ...(config.SMTP_USER
            ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } }
            : {}),
        })
      : null;
  }

  async send(mail: OutgoingMail): Promise<void> {
    // Disabled is a first-class mode, not an error. Tests and CI have no mail
    // server, and a notification failing there would fail the job that produced
    // it — turning "no SMTP configured" into a stuck pipeline.
    if (!this.transport) {
      this.logger.log(`[mail disabled] would send "${mail.subject}" to ${mail.to}`);
      return;
    }

    const info = await this.transport.sendMail({
      from: this.config.MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    this.logger.log(`Sent "${mail.subject}" to ${mail.to} (${info.messageId})`);
  }

  onModuleDestroy(): void {
    this.transport?.close();
  }
}
