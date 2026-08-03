import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MotorsService } from './motors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CommandService } from '../command/command.service';

/**
 * REST endpoints for motor data and commands.
 * All endpoints require authentication (JwtAuthGuard).
 */
@Controller('motors')
@UseGuards(JwtAuthGuard)
export class MotorsController {
  constructor(
    private readonly motorsService: MotorsService,
    private readonly commandService: CommandService,
  ) {}

  /** Get all motors with live sensor data (for grid view). */
  @Get()
  async getAll() {
    return this.motorsService.getAll();
  }

  /** Get a single motor with detailed info. */
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    const motor = await this.motorsService.getById(id);
    if (!motor) {
      throw new NotFoundException(`Motor ${id} not found`);
    }
    return motor;
  }

  /** Send stop command to a motor (operator/admin only). */
  @Post(':id/stop')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async stop(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as any).user;
    const requestId = await this.commandService.publishStop(id, user.email);
    return { message: 'Comando de detención enviado', requestId };
  }

  /** Send restart command to a motor (operator/admin only). */
  @Post(':id/restart')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async restart(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as any).user;
    const requestId = await this.commandService.publishRestart(id, user.email);
    return { message: 'Comando de reinicio enviado', requestId };
  }
}
