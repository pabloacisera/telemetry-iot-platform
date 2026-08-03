import { Module } from '@nestjs/common';
import { TelemetryConsumerService } from './telemetry-consumer.service';
import { TelemetryEvaluationService } from './telemetry-evaluation.service';
import { MotorEvaluationService } from './motor-evaluation.service';
import { SensorEvaluationService } from './sensor-evaluation.service';
import { TelemetryRepository } from './telemetry.repository';
import { StatusTransitionService } from './status-transition.service';
import { RetentionService } from './retention.service';
import { RealtimeModule } from '../realtime';
import { CommandModule } from '../command/command.module';

@Module({
  imports: [RealtimeModule, CommandModule],
  providers: [
    TelemetryConsumerService,
    TelemetryEvaluationService,
    MotorEvaluationService,
    SensorEvaluationService,
    TelemetryRepository,
    StatusTransitionService,
    RetentionService,
  ],
  exports: [TelemetryEvaluationService, SensorEvaluationService, StatusTransitionService],
})
export class TelemetryModule {}
