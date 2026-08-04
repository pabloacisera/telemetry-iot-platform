import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { MotorConfigService } from './motor-config.service';
import { CreateMotorDto, UpdateMotorDto, UpdateThresholdsDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/**
 * Configuration endpoints — admin only.
 * Handles motor CRUD and sensor threshold management.
 * Creating a motor also provisions MQTT credentials in Mosquitto.
 */
@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MotorConfigController {
  constructor(private readonly configService: MotorConfigService) {}

  /** List all motors with their sensors (for config page). */
  @Get('motors')
  async listMotors() {
    return this.configService.getAllMotors();
  }

  /** Get sensor standards (recommended thresholds). */
  @Get('standards')
  async getStandards() {
    return this.configService.getSensorStandards();
  }

  /** Create a new motor + provision MQTT credentials. */
  @Post('motors')
  async createMotor(@Body() dto: CreateMotorDto) {
    return this.configService.createMotor(dto);
  }

  /** Update motor metadata. */
  @Patch('motors/:id')
  async updateMotor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMotorDto,
  ) {
    return this.configService.updateMotor(id, dto);
  }

  /** Delete a motor and deprovision MQTT credentials. */
  @Delete('motors/:id')
  async deleteMotor(@Param('id', ParseIntPipe) id: number) {
    return this.configService.deleteMotor(id);
  }

  /** Update sensor thresholds. */
  @Patch('motors/:motorId/sensors/:sensorId/thresholds')
  async updateThresholds(
    @Param('motorId', ParseIntPipe) motorId: number,
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body() dto: UpdateThresholdsDto,
  ) {
    return this.configService.updateThresholds(motorId, sensorId, dto);
  }
}
