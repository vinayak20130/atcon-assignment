import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerService } from './services/mailer.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [PrismaModule],
  providers: [MailerService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
