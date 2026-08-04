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
    const entry = JSON.stringify({
      value,
      timestamp: recordedAt.toISOString(),
    });
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

  /** Get all snapshots (for initial grid load). Uses pipeline for single roundtrip. */
  async getAllSnapshots(): Promise<
    Map<number, { value: number; status: string; recordedAt: string }>
  > {
    const keys = await this.redis.keys('motor_sensor:*:last');
    const result = new Map();

    if (keys.length === 0) return result;

    // Single pipeline: fetch all hashes in one roundtrip
    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }
    const responses = await pipeline.exec();

    if (!responses) return result;

    for (let i = 0; i < keys.length; i++) {
      const idMatch = keys[i].match(/motor_sensor:(\d+):last/);
      if (!idMatch) continue;

      const [err, data] = responses[i] as [
        Error | null,
        Record<string, string>,
      ];
      if (err || !data || !data.value) continue;

      result.set(parseInt(idMatch[1], 10), {
        value: parseFloat(data.value),
        status: data.status,
        recordedAt: data.recorded_at,
      });
    }

    return result;
  }

  /** Get recent readings for a sensor (ring buffer, up to 5 points). */
  async getRecentReadings(
    motorSensorId: number,
  ): Promise<{ value: number; timestamp: string }[]> {
    const key = `motor_sensor:${motorSensorId}:recent`;
    const entries = await this.redis.lrange(key, 0, -1);
    return entries.map(
      (e) => JSON.parse(e) as { value: number; timestamp: string },
    );
  }

  // ===================================================================
  // State persistence — survives process restarts
  // ===================================================================

  /** @deprecated Use pushToWindow instead. Kept only for restoreWindows compatibility. */
  // persistWindow removed — was storing as string, conflicting with list-based pushToWindow.

  /** Restore all sliding windows from Redis (list-based). */
  async restoreWindows(): Promise<Map<number, boolean[]>> {
    const keys = await this.redis.keys('state:window:*');
    const result = new Map<number, boolean[]>();
    if (keys.length === 0) return result;

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.lrange(key, 0, -1);
    }
    const responses = await pipeline.exec();
    if (!responses) return result;

    for (let i = 0; i < keys.length; i++) {
      const idMatch = keys[i].match(/state:window:(\d+)/);
      if (!idMatch) continue;
      const [err, values] = responses[i] as [Error | null, string[] | null];
      if (err || !values) continue;
      result.set(
        parseInt(idMatch[1], 10),
        values.map((v) => v === '1'),
      );
    }
    return result;
  }

  /** Persist escalation timer expiry timestamp for a motor. */
  async persistEscalationTimer(
    motorId: number,
    expiresAt: number,
  ): Promise<void> {
    const key = `state:escalation:${motorId}`;
    await this.redis.set(key, expiresAt.toString(), 'EX', 180); // TTL 3 min
  }

  /** Remove escalation timer state. */
  async clearEscalationTimer(motorId: number): Promise<void> {
    await this.redis.del(`state:escalation:${motorId}`);
  }

  /** Restore all active escalation timers. Returns motorId → expiresAt timestamp. */
  async restoreEscalationTimers(): Promise<Map<number, number>> {
    const keys = await this.redis.keys('state:escalation:*');
    const result = new Map<number, number>();
    if (keys.length === 0) return result;

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const responses = await pipeline.exec();
    if (!responses) return result;

    for (let i = 0; i < keys.length; i++) {
      const idMatch = keys[i].match(/state:escalation:(\d+)/);
      if (!idMatch) continue;
      const [err, value] = responses[i] as [Error | null, string | null];
      if (err || !value) continue;
      result.set(parseInt(idMatch[1], 10), parseInt(value, 10));
    }
    return result;
  }

  /** Persist auto-restart-used flag for a motor. */
  async persistAutoRestartUsed(motorId: number, used: boolean): Promise<void> {
    const key = `state:auto_restart:${motorId}`;
    if (used) {
      await this.redis.set(key, '1', 'EX', 3600); // TTL 1h
    } else {
      await this.redis.del(key);
    }
  }

  /** Restore auto-restart-used flags. Returns motorId → boolean. */
  async restoreAutoRestartUsed(): Promise<Map<number, boolean>> {
    const keys = await this.redis.keys('state:auto_restart:*');
    const result = new Map<number, boolean>();
    if (keys.length === 0) return result;

    for (const key of keys) {
      const idMatch = key.match(/state:auto_restart:(\d+)/);
      if (idMatch) {
        result.set(parseInt(idMatch[1], 10), true);
      }
    }
    return result;
  }

  /** Persist sensor auto-restart-used flag. */
  async persistSensorAutoRestartUsed(
    motorSensorId: number,
    used: boolean,
  ): Promise<void> {
    const key = `state:sensor_auto_restart:${motorSensorId}`;
    if (used) {
      await this.redis.set(key, '1', 'EX', 3600);
    } else {
      await this.redis.del(key);
    }
  }

  /** Restore sensor auto-restart-used flags. */
  async restoreSensorAutoRestartUsed(): Promise<Map<number, boolean>> {
    const keys = await this.redis.keys('state:sensor_auto_restart:*');
    const result = new Map<number, boolean>();
    if (keys.length === 0) return result;

    for (const key of keys) {
      const idMatch = key.match(/state:sensor_auto_restart:(\d+)/);
      if (idMatch) {
        result.set(parseInt(idMatch[1], 10), true);
      }
    }
    return result;
  }

  /** Persist stuck tracker for a sensor. */
  async persistStuckTracker(
    motorSensorId: number,
    value: number,
    count: number,
  ): Promise<void> {
    const key = `state:stuck:${motorSensorId}`;
    await this.redis.hset(key, {
      value: value.toString(),
      count: count.toString(),
    });
    await this.redis.expire(key, 600);
  }

  /** Restore all stuck trackers. */
  async restoreStuckTrackers(): Promise<
    Map<number, { value: number; count: number }>
  > {
    const keys = await this.redis.keys('state:stuck:*');
    const result = new Map<number, { value: number; count: number }>();
    if (keys.length === 0) return result;

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }
    const responses = await pipeline.exec();
    if (!responses) return result;

    for (let i = 0; i < keys.length; i++) {
      const idMatch = keys[i].match(/state:stuck:(\d+)/);
      if (!idMatch) continue;
      const [err, data] = responses[i] as [
        Error | null,
        Record<string, string>,
      ];
      if (err || !data || !data.value) continue;
      result.set(parseInt(idMatch[1], 10), {
        value: parseFloat(data.value),
        count: parseInt(data.count, 10),
      });
    }
    return result;
  }

  // ===================================================================
  // Distributed lock — prevents race conditions in multi-instance
  // ===================================================================

  /**
   * Acquire a distributed lock for a motor evaluation.
   * Uses SETNX with TTL to prevent deadlocks.
   * Returns true if lock acquired, false if another instance holds it.
   */
  async acquireMotorLock(motorId: number, ttlMs = 200): Promise<boolean> {
    const key = `lock:motor:${motorId}`;
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  /** Release a motor lock. */
  async releaseMotorLock(motorId: number): Promise<void> {
    await this.redis.del(`lock:motor:${motorId}`);
  }

  // ===================================================================
  // Source-of-truth state operations (atomic reads/writes)
  // ===================================================================

  /** Push a reading to a sensor's sliding window (atomic, max 8 elements). */
  async pushToWindow(
    motorSensorId: number,
    isAnomalous: boolean,
  ): Promise<boolean[]> {
    const key = `state:window:${motorSensorId}`;
    // Guard: if key exists as wrong type (legacy string), delete it first
    const type = await this.redis.type(key);
    if (type !== 'none' && type !== 'list') {
      await this.redis.del(key);
    }
    await this.redis.rpush(key, isAnomalous ? '1' : '0');
    await this.redis.ltrim(key, -8, -1);
    await this.redis.expire(key, 600);
    const raw = await this.redis.lrange(key, 0, -1);
    return raw.map((v) => v === '1');
  }

  /** Get a sensor's current sliding window. */
  async getWindow(motorSensorId: number): Promise<boolean[]> {
    const key = `state:window:${motorSensorId}`;
    const raw = await this.redis.lrange(key, 0, -1);
    return raw.map((v) => v === '1');
  }

  /** Clear a sensor's sliding window. */
  async clearWindow(motorSensorId: number): Promise<void> {
    await this.redis.del(`state:window:${motorSensorId}`);
  }

  /** Get auto-restart-used flag for a motor (returns false if not set). */
  async getAutoRestartUsed(motorId: number): Promise<boolean> {
    const val = await this.redis.get(`state:auto_restart:${motorId}`);
    return val === '1';
  }

  /** Get escalation timer expiry for a motor (null if no active timer). */
  async getEscalationExpiry(motorId: number): Promise<number | null> {
    const val = await this.redis.get(`state:escalation:${motorId}`);
    return val ? parseInt(val, 10) : null;
  }

  /** Get a single stuck tracker for a sensor. */
  async getStuckTracker(
    motorSensorId: number,
  ): Promise<{ value: number; count: number }> {
    const key = `state:stuck:${motorSensorId}`;
    const data = await this.redis.hgetall(key);
    if (!data || !data.value) return { value: NaN, count: 0 };
    return { value: parseFloat(data.value), count: parseInt(data.count, 10) };
  }

  /** Get sensor auto-restart-used flag. */
  async getSensorAutoRestartUsed(motorSensorId: number): Promise<boolean> {
    const val = await this.redis.get(
      `state:sensor_auto_restart:${motorSensorId}`,
    );
    return val === '1';
  }
}
