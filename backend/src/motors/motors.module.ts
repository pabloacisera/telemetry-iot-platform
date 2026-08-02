import { Module } from '@nestjs/common';
import { MotorsController } from './motors.controller';
import { MotorsService } from './motors.service';

@Module({
  controllers: [MotorsController],
  providers: [MotorsService],
  exports: [MotorsService],
})
export class MotorsModule {}
