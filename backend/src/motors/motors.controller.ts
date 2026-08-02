import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { MotorsService } from './motors.service';

/**
 * REST endpoints for motor data.
 * GET /motors — initial grid snapshot (served from Redis).
 * GET /motors/:id — detailed motor view.
 */
@Controller('motors')
export class MotorsController {
  constructor(private readonly motorsService: MotorsService) {}

  @Get()
  async getAll() {
    return this.motorsService.getAll();
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    const motor = await this.motorsService.getById(id);
    if (!motor) {
      throw new NotFoundException(`Motor ${id} not found`);
    }
    return motor;
  }
}
