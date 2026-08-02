import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';

/**
 * REST endpoints for alert management.
 * Resolution uses optimistic locking (409 if concurrent resolution).
 */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async getActive() {
    return this.alertsService.getActive();
  }

  @Get('motor/:motorId')
  async getByMotor(@Param('motorId', ParseIntPipe) motorId: number) {
    return this.alertsService.getByMotor(motorId);
  }

  @Patch(':id/resolve')
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userId: number; note?: string },
  ) {
    await this.alertsService.resolve(id, body.userId, body.note);
    return { message: 'Alert resolved' };
  }
}
