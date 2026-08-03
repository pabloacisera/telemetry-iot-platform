import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as mqtt from 'mqtt';
import { TelemetryEventDto } from './dto/telemetry-event.dto';
import { TelemetryEvaluationService } from './telemetry-evaluation.service';
import { StatusTransitionService } from './status-transition.service';
import { RealtimeGateway } from '../realtime';
import { PrismaService } from '../prisma';

/**
 * MQTT subscriber — the backend's connection to the broker.
 *
 * Subscribes to telemetry, status (LWT), command acks, and restart-progress.
 * Validates incoming payloads via DTO and delegates evaluation to the
 * TelemetryEvaluationService orchestrator.
 *
 * Configured with clean_session=false for QoS 1 redelivery on reconnection.
 */
@Injectable()
export class TelemetryConsumerService implements OnModuleInit, OnModuleDestroy {
  private client!: mqtt.MqttClient;
  private readonly logger = new Logger(TelemetryConsumerService.name);

  /** Grace window timers: motor_id → timeout handle. */
  private disconnectionTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Lookup: "motorId:sensorType" → motor_sensor_id. */
  private sensorLookup: Map<string, number> = new Map();

  /** Motor connection types: motor_id → "wifi" | "lan". */
  private connectionTypes: Map<number, string> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly evaluationService: TelemetryEvaluationService,
    private readonly statusTransition: StatusTransitionService,
    private readonly realtime: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.buildLookups();
    this.connectToBroker();
  }

  onModuleDestroy(): void {
    if (this.client) this.client.end();
  }

  /** Build lookup maps from the database (motor_sensor_id and connection types). */
  private async buildLookups(): Promise<void> {
    const sensors = await this.prisma.motorSensor.findMany({
      include: { motor: true },
    });

    for (const sensor of sensors) {
      this.sensorLookup.set(`${sensor.motorId}:${sensor.sensorType}`, sensor.id);
      this.connectionTypes.set(sensor.motorId, sensor.motor.connectionType);
    }

    this.logger.log(`Lookups built: ${this.sensorLookup.size} sensors`);
  }

  /** Connect to MQTT broker with persistent session. */
  private connectToBroker(): void {
    const host = this.configService.get<string>('MQTT_BROKER_HOST', 'localhost');
    const port = this.configService.get<number>('MQTT_BROKER_PORT', 1883);
    const user = this.configService.get<string>('MQTT_BACKEND_USER', 'backend_service');
    const pass = this.configService.get<string>('MQTT_BACKEND_PASS', 'backend_dev_pass');

    this.client = mqtt.connect(`mqtt://${host}:${port}`, {
      clientId: 'backend_service',
      username: user,
      password: pass,
      clean: false,
      reconnectPeriod: 1000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      this.subscribe();
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.handleMessage(topic, payload).catch((err) => {
        this.logger.error(`Message handling error on ${topic}: ${err.message}`);
      });
    });
  }

  /** Subscribe to all relevant topics. */
  private subscribe(): void {
    this.client.subscribe('plant/motor/+/telemetry', { qos: 1 });
    this.client.subscribe('plant/motor/+/status', { qos: 1 });
    this.client.subscribe('plant/motor/+/restart-progress', { qos: 0 });
    this.logger.log('Subscribed to telemetry, status, restart-progress');
  }

  /** Route messages to the correct handler based on topic. */
  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return;
    }

    if (topic.includes('/telemetry')) {
      await this.handleTelemetry(data);
    } else if (topic.includes('/status') && !topic.includes('/cmd')) {
      await this.handleStatus(data);
    } else if (topic.includes('/restart-progress')) {
      await this.handleRestartProgress(data);
    }
  }

  /** Validate and process a telemetry message. */
  private async handleTelemetry(data: Record<string, unknown>): Promise<void> {
    const dto = plainToInstance(TelemetryEventDto, data);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) return;

    const recordedAt = new Date(dto.timestamp);
    const motorId = dto.motor_id;

    this.clearDisconnectionTimer(motorId);

    if (dto.temperature_c !== undefined) {
      const id = this.sensorLookup.get(`${motorId}:temperature`);
      if (id) await this.evaluationService.evaluateReading(id, dto.temperature_c, recordedAt);
    }
    if (dto.vibration_mm_s !== undefined) {
      const id = this.sensorLookup.get(`${motorId}:vibration`);
      if (id) await this.evaluationService.evaluateReading(id, dto.vibration_mm_s, recordedAt);
    }
    if (dto.current_a !== undefined) {
      const id = this.sensorLookup.get(`${motorId}:current`);
      if (id) await this.evaluationService.evaluateReading(id, dto.current_a, recordedAt);
    }
  }

  /** Handle LWT online/offline status messages. */
  private async handleStatus(data: Record<string, unknown>): Promise<void> {
    const motorId = data.motor_id as number;
    const state = data.state as string;

    if (!motorId) return;

    if (state === 'offline') {
      // Get current motor status from DB for proper transition
      const motor = await this.prisma.motor.findUnique({ where: { id: motorId } });
      if (motor && motor.status !== 'manual_shutdown') {
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'manual_shutdown',
        );
        // Update in-memory status in evaluation service
        this.evaluationService.setMotorStatus(motorId, 'manual_shutdown');
      }
    } else if (state === 'online') {
      this.clearDisconnectionTimer(motorId);
      // Only transition to healthy if motor was manually stopped or restarting
      const motor = await this.prisma.motor.findUnique({ where: { id: motorId } });
      if (motor && (motor.status === 'manual_shutdown' || motor.status === 'restarting')) {
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'healthy',
        );
        // Update in-memory status + reset evaluation window
        this.evaluationService.setMotorStatus(motorId, 'healthy');
        this.evaluationService.resetWindow(motorId);
      }
    }
  }

  /** Forward restart-progress to WebSocket clients and update motor status. */
  private async handleRestartProgress(data: Record<string, unknown>): Promise<void> {
    const motorId = data.motor_id as number;
    const secondsRemaining = data.seconds_remaining as number;

    if (!motorId) return;

    // On first progress event, transition to 'restarting' in DB
    if (secondsRemaining >= 99) {
      const motor = await this.prisma.motor.findUnique({ where: { id: motorId } });
      if (motor && motor.status !== 'restarting') {
        await this.statusTransition.transitionMotor(
          motorId,
          motor.status,
          'restarting',
        );
      }
    }

    this.realtime.emitRestartProgress(motorId, {
      motorId,
      secondsRemaining,
    });

    // When countdown finishes, the 'online' status message will trigger transition to 'healthy'
  }

  /** Start grace window timer (20s WiFi / 5s LAN). */
  private startDisconnectionTimer(motorId: number): void {
    const connType = this.connectionTypes.get(motorId) || 'wifi';
    const graceMs = connType === 'lan' ? 5000 : 20000;

    const timer = setTimeout(async () => {
      for (const [key, sensorId] of this.sensorLookup.entries()) {
        if (key.startsWith(`${motorId}:`)) {
          await this.evaluationService.onSensorDisconnected(sensorId);
        }
      }
    }, graceMs);

    this.disconnectionTimers.set(motorId, timer);
  }

  /** Clear disconnection timer (motor reconnected within grace window). */
  private clearDisconnectionTimer(motorId: number): void {
    const timer = this.disconnectionTimers.get(motorId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectionTimers.delete(motorId);
    }
  }
}
