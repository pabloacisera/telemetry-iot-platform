import { IsInt, IsISO8601, IsNumber, IsOptional } from 'class-validator';

/**
 * DTO for incoming MQTT telemetry messages.
 * Validates structure before any business logic is applied.
 * A sensor field may be absent if that sensor is disconnected (ESP32 returns null).
 */
export class TelemetryEventDto {
  @IsInt()
  motor_id!: number;

  @IsISO8601()
  timestamp!: string;

  @IsOptional()
  @IsNumber()
  temperature_c?: number;

  @IsOptional()
  @IsNumber()
  vibration_mm_s?: number;

  @IsOptional()
  @IsNumber()
  current_a?: number;
}
