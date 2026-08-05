import {
  IsString,
  IsOptional,
  IsNumber,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

/**
 * DTO for creating a new motor.
 * Validates all required fields for motor + initial MQTT provisioning.
 */
export class CreateMotorDto {
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'code must be uppercase alphanumeric with dashes only',
  })
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @IsNumber()
  @Min(0.1)
  ratedCurrentA!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  insulationClass?: string;

  @IsString()
  @MaxLength(4)
  connectionType!: string;
}

/**
 * DTO for updating an existing motor (partial).
 */
export class UpdateMotorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  connectionType?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  alarmConsecutiveReadings?: number;

  @IsOptional()
  @IsNumber()
  @Min(5000)
  alarmGracePeriodMs?: number;
}

/**
 * DTO for updating sensor thresholds.
 */
export class UpdateThresholdsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  healthyMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  warningMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  criticalMax?: number;
}
