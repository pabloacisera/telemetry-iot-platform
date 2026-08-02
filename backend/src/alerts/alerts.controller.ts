import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AlertsService } from './alerts.service';
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
    const user = (req as any).user as { userId: number };
    await this.alertsService.resolve(id, user.userId, body.note);
    return { message: 'Alert resolved' };
  }
}
