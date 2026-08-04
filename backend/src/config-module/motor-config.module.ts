import { Module } from '@nestjs/common';
import { MotorConfigController } from './motor-config.controller';
import { MotorConfigService } from './motor-config.service';
import { MqttProvisioningService } from './mqtt-provisioning.service';
import { CommandModule } from '../command/command.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [CommandModule, TelemetryModule],
  controllers: [MotorConfigController],
  providers: [MotorConfigService, MqttProvisioningService],
  exports: [MotorConfigService],
})
export class MotorConfigModule {}
