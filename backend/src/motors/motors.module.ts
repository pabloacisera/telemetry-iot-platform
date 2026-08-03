import { Module } from '@nestjs/common';
import { MotorsController } from './motors.controller';
import { MotorsService } from './motors.service';
import { CommandModule } from '../command/command.module';

@Module({
  imports: [CommandModule],
  controllers: [MotorsController],
  providers: [MotorsService],
  exports: [MotorsService],
})
export class MotorsModule {}
