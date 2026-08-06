import { IsOptional, IsInt, IsIn, IsDateString, Min, Max } from 'class-validator';
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
}
