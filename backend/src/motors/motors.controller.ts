import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { MotorsService } from './motors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * REST endpoints for motor data.
 * All endpoints require authentication (JwtAuthGuard).
 * GET /motors — initial grid snapshot (served from Redis).
 * GET /motors/:id — detailed motor view with alerts and history.
 */
@Controller('motors')
@UseGuards(JwtAuthGuard)
export class MotorsController {
  constructor(private readonly motorsService: MotorsService) {}

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
}
