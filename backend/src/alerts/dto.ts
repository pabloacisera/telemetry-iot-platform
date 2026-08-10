import {
  IsOptional,
  IsInt,
  IsIn,
  IsDateString,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/** DTO for GET /alerts/history query params. */
export class GetAlertHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  motorId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'resolved'])
  status?: 'all' | 'active' | 'resolved' = 'all';

  /**
   * Causa de la alerta (valor de `metadata.cause`).
   * Valores: sustained_anomaly, critical_reading, grace_timer_expired,
   * recurrence_after_restart. El valor especial 'none' filtra alertas sin
   * causa (sensor faults y alertas antiguas sin metadata).
   */
  @IsOptional()
  @IsString()
  cause?: string;
}
