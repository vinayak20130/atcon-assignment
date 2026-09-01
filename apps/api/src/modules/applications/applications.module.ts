import { Module } from '@nestjs/common';
import { ApplicationIntakeService } from './application-intake.service';
import { PublicApplicationsController } from './public-applications.controller';

@Module({
  controllers: [PublicApplicationsController],
  providers: [ApplicationIntakeService],
  exports: [ApplicationIntakeService],
})
export class ApplicationsModule {}
