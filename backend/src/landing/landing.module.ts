import { Module } from '@nestjs/common';
import { LandingController } from './landing.controller';
import { LandingService } from './landing.service';
import { EmailService } from './email.service';

@Module({
  controllers: [LandingController],
  providers: [LandingService, EmailService],
  exports: [EmailService],
})
export class LandingModule {}
