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
import {
  CreateMotorDto,
  UpdateMotorDto,
  UpdateThresholdsDto,
  UpdateAlertConfigDto,
  UpsertAlertOverrideDto,
  UpdateSensorStandardDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/**
 * Configuration endpoints.
 * Read operations (GET) are available to any authenticated role.
 * Mutations (POST/PATCH/DELETE) require the admin role.
 */
@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MotorConfigController {
  constructor(private readonly configService: MotorConfigService) {}

  /** List all motors with their sensors. */
  @Get('motors')
  async listMotors() {
    return this.configService.getAllMotors();
  }

  /** Get sensor standards (recommended thresholds). */
  @Get('standards')
  async getStandards() {
    return this.configService.getSensorStandards();
  }

  /** Update global default thresholds for a sensor type. */
  @Patch('standards/:id')
  @Roles('admin')
  async updateStandard(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSensorStandardDto,
  ) {
    return this.configService.updateSensorStandard(id, dto);
  }

  /** Create a new motor + provision MQTT credentials. */
  @Post('motors')
  @Roles('admin')
  async createMotor(@Body() dto: CreateMotorDto) {
    return this.configService.createMotor(dto);
  }

  /** Update motor metadata. */
  @Patch('motors/:id')
  @Roles('admin')
  async updateMotor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMotorDto,
  ) {
    return this.configService.updateMotor(id, dto);
  }

  /** Delete a motor and deprovision MQTT credentials. */
  @Delete('motors/:id')
  @Roles('admin')
  async deleteMotor(@Param('id', ParseIntPipe) id: number) {
    return this.configService.deleteMotor(id);
  }

  /** Update sensor thresholds. */
  @Patch('motors/:motorId/sensors/:sensorId/thresholds')
  @Roles('admin')
  async updateThresholds(
    @Param('motorId', ParseIntPipe) motorId: number,
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body() dto: UpdateThresholdsDto,
  ) {
    return this.configService.updateThresholds(motorId, sensorId, dto);
  }

  // ── Alert Configuration ──────────────────────────────────────

  /** Get global alert configuration. */
  @Get('alerts')
  async getAlertConfig() {
    return this.configService.getAlertConfig();
  }

  /** Update global alert configuration. */
  @Patch('alerts')
  @Roles('admin')
  async updateAlertConfig(@Body() dto: UpdateAlertConfigDto) {
    return this.configService.updateAlertConfig(dto);
  }

  /** List all per-motor alert overrides. */
  @Get('alerts/overrides')
  async listAlertOverrides() {
    return this.configService.listAlertOverrides();
  }

  /** Create or update a per-motor alert override. */
  @Post('alerts/overrides')
  @Roles('admin')
  async upsertAlertOverride(@Body() dto: UpsertAlertOverrideDto) {
    return this.configService.upsertAlertOverride(dto);
  }

  /** Delete a per-motor alert override (motor reverts to global config). */
  @Delete('alerts/overrides/:motorId')
  @Roles('admin')
  async deleteAlertOverride(@Param('motorId', ParseIntPipe) motorId: number) {
    return this.configService.deleteAlertOverride(motorId);
  }
}
