import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { randomUUID } from 'crypto';

/**
 * Publishes MQTT commands to motors and sensors.
 *
 * Used for:
 * - Forced restart (automatic, from escalation logic).
 * - Manual stop/restart (operator/admin action via REST).
 * - Sensor restart (auto or manual).
 *
 * Each command carries a unique request_id for ack correlation.
 */
@Injectable()
export class CommandService implements OnModuleInit {
  private client!: mqtt.MqttClient;
  private readonly logger = new Logger(CommandService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Connect to the MQTT broker on module initialization. */
  onModuleInit(): void {
    const host = this.configService.get<string>(
      'MQTT_BROKER_HOST',
      'localhost',
    );
    const port = this.configService.get<number>('MQTT_BROKER_PORT', 1883);
    const user = this.configService.get<string>(
      'MQTT_BACKEND_USER',
      'backend_service',
    );
    const pass = this.configService.get<string>(
      'MQTT_BACKEND_PASS',
      'backend_dev_pass',
    );

    this.client = mqtt.connect(`mqtt://${host}:${port}`, {
      clientId: 'backend_command_publisher',
      username: user,
      password: pass,
      clean: false,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      this.logger.log('Command publisher connected to MQTT');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Command MQTT error: ${err.message}`);
    });
  }

  /** Publish a restart command to a motor. Returns the request_id. */
  async publishRestart(motorId: number, requestedBy: string): Promise<string> {
    const requestId = randomUUID();
    const topic = `plant/motor/${motorId}/cmd`;
    const payload = JSON.stringify({
      action: 'restart',
      requested_by: requestedBy,
      reason: 'forced_restart_anomaly',
      request_id: requestId,
    });

    await this.publish(topic, payload);
    this.logger.log(`Restart → motor ${motorId} (${requestId})`);
    return requestId;
  }

  /** Publish a stop command to a motor. Returns the request_id. */
  async publishStop(motorId: number, requestedBy: string): Promise<string> {
    const requestId = randomUUID();
    const topic = `plant/motor/${motorId}/cmd`;
    const payload = JSON.stringify({
      action: 'stop',
      requested_by: requestedBy,
      reason: 'manual_stop',
      request_id: requestId,
    });

    await this.publish(topic, payload);
    this.logger.log(`Stop → motor ${motorId} (${requestId})`);
    return requestId;
  }

  /** Publish a sensor restart command. Returns the request_id. */
  async publishSensorRestart(
    motorId: number,
    sensorType: string,
  ): Promise<string> {
    const requestId = randomUUID();
    const topic = `plant/motor/${motorId}/sensor/${sensorType}/cmd`;
    const payload = JSON.stringify({
      action: 'restart_sensor',
      request_id: requestId,
    });

    await this.publish(topic, payload);
    this.logger.log(
      `Sensor restart → motor ${motorId}/${sensorType} (${requestId})`,
    );
    return requestId;
  }

  /** Low-level MQTT publish with QoS 1. */
  private publish(topic: string, payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Notify the simulator that a new motor was added (hot-reload).
   * The simulator listens on system/simulator/motor-added and starts
   * a new MotorSimulator instance at runtime.
   */
  async notifySimulatorMotorAdded(data: {
    motorId: number;
    ratedCurrentA: number;
    connectionType: string;
    mqttUser: string;
    mqttPass: string;
  }): Promise<void> {
    const payload = JSON.stringify(data);
    await this.publish('system/simulator/motor-added', payload);
    this.logger.log(`Simulator notified: motor-added (motor ${data.motorId})`);
  }

  /**
   * Notify the simulator that a motor was removed (hot-reload).
   * The simulator listens on system/simulator/motor-removed and stops
   * the corresponding MotorSimulator instance at runtime.
   */
  async notifySimulatorMotorRemoved(motorId: number): Promise<void> {
    const payload = JSON.stringify({ motorId });
    await this.publish('system/simulator/motor-removed', payload);
    this.logger.log(`Simulator notified: motor-removed (motor ${motorId})`);
  }
}
