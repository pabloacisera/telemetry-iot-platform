import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AlertsService } from './alerts.service';
import { GetAlertHistoryDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/**
 * REST endpoints for alert management.
 * All endpoints require authentication.
 * Resolution requires admin or operator role.
 * Uses optimistic locking (409 if concurrent resolution).
 */
@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /** Get all active (unresolved) alerts. Any authenticated user can view. */
  @Get()
  async getActive() {
    return this.alertsService.getActive();
  }

  /**
   * Get paginated alert history with optional filters.
   * Accessible to all authenticated roles.
   */
  @Get('history')
  async getHistory(@Query() query: GetAlertHistoryDto) {
    return this.alertsService.getHistory({
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      motorId: query.motorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      status: query.status ?? 'all',
      cause: query.cause,
    });
  }

  /** Get alerts for a specific motor. Any authenticated user can view. */
  @Get('motor/:motorId')
  async getByMotor(@Param('motorId', ParseIntPipe) motorId: number) {
    return this.alertsService.getByMotor(motorId);
  }

  /** Resolve an alert. Only admin or operator. */
  @Patch(':id/resolve')
  @Roles('admin', 'operator')
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Body() body: { note?: string },
  ) {
    const user = (req as unknown as { user: { userId: number } }).user;
    await this.alertsService.resolve(id, user.userId, body.note);
    return { message: 'Alert resolved' };
  }
}
