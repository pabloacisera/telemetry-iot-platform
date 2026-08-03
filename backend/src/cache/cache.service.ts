import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis wrapper for the live motor+sensor snapshot.
 * Key pattern: motor_sensor:{id}:last → hash {value, status, recorded_at}
 * Write-through: updated on every valid reading in the same flow as MySQL persistence.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /** Update the live snapshot for a motor_sensor. */
  async updateSnapshot(
    motorSensorId: number,
    value: number,
    status: string,
    recordedAt: Date,
  ): Promise<void> {
    const key = `motor_sensor:${motorSensorId}:last`;
    await this.redis.hset(key, {
      value: value.toString(),
      status,
      recorded_at: recordedAt.toISOString(),
    });

    // Push to ring buffer (last 5 readings for instant chart load)
    const historyKey = `motor_sensor:${motorSensorId}:recent`;
    const entry = JSON.stringify({ value, timestamp: recordedAt.toISOString() });
    await this.redis.rpush(historyKey, entry);
    await this.redis.ltrim(historyKey, -5, -1); // keep only last 5
  }

  /** Get the live snapshot for a motor_sensor. */
  async getSnapshot(
    motorSensorId: number,
  ): Promise<{ value: number; status: string; recordedAt: string } | null> {
    const key = `motor_sensor:${motorSensorId}:last`;
    const data = await this.redis.hgetall(key);

    if (!data || !data.value) return null;

    return {
      value: parseFloat(data.value),
      status: data.status,
      recordedAt: data.recorded_at,
    };
  }

  /** Get all snapshots (for initial grid load). */
  async getAllSnapshots(): Promise<
    Map<number, { value: number; status: string; recordedAt: string }>
  > {
    const keys = await this.redis.keys('motor_sensor:*:last');
    const result = new Map();

    for (const key of keys) {
      const idMatch = key.match(/motor_sensor:(\d+):last/);
      if (!idMatch) continue;

      const id = parseInt(idMatch[1], 10);
      const data = await this.redis.hgetall(key);

      if (data && data.value) {
        result.set(id, {
          value: parseFloat(data.value),
          status: data.status,
          recordedAt: data.recorded_at,
        });
      }
    }

    return result;
  }

  /** Get recent readings for a sensor (ring buffer, up to 5 points). */
  async getRecentReadings(
    motorSensorId: number,
  ): Promise<{ value: number; timestamp: string }[]> {
    const key = `motor_sensor:${motorSensorId}:recent`;
    const entries = await this.redis.lrange(key, 0, -1);
    return entries.map((e) => JSON.parse(e));
  }
}
