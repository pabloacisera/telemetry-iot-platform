import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';

type ReadingData = {
  motorSensorId: number;
  value: number;
  isAnomalous: boolean;
  isImplausible: boolean;
  recordedAt: Date;
};

/**
 * Persistence layer for telemetry readings.
 * Buffers writes and flushes with createMany every FLUSH_INTERVAL_MS
 * to avoid exhausting the Prisma connection pool under high throughput.
 */
@Injectable()
export class TelemetryRepository implements OnModuleDestroy {
  private readonly logger = new Logger(TelemetryRepository.name);

  /** Buffer of pending readings to write. */
  private buffer: ReadingData[] = [];

  /** Flush interval in ms. */
  private readonly FLUSH_INTERVAL_MS = 500;

  /** Max buffer size before forcing an immediate flush. */
  private readonly MAX_BUFFER_SIZE = 200;

  /** Interval handle. */
  private flushTimer: NodeJS.Timeout;

  /** Track if a flush is in progress to avoid concurrent flushes. */
  private flushing = false;

  constructor(private readonly prisma: PrismaService) {
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.flushTimer);
    // Final flush on shutdown (best-effort, sync not awaited by Nest)
    this.flush();
  }

  /** Enqueue a reading for batched persistence. */
  async persistReading(data: ReadingData): Promise<void> {
    this.buffer.push(data);

    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      await this.flush();
    }
  }

  /** Flush buffered readings to the database in a single createMany call. */
  private async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const batch = this.buffer.splice(0);

    try {
      await this.prisma.reading.createMany({
        data: batch.map((r) => ({
          motorSensorId: r.motorSensorId,
          value: r.value,
          isAnomalous: r.isAnomalous,
          isImplausible: r.isImplausible,
          recordedAt: r.recordedAt,
        })),
      });
    } catch (err) {
      this.logger.error(
        `Failed to flush ${batch.length} readings: ${(err as Error).message}`,
      );
      // Re-enqueue failed batch at the front for retry on next flush
      this.buffer.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }

  /** Get the last N readings for a motor_sensor (used on boot to restore window). */
  async getLastReadings(motorSensorId: number, count: number) {
    return this.prisma.reading.findMany({
      where: { motorSensorId },
      orderBy: { recordedAt: 'desc' },
      take: count,
    });
  }

  /** Get all motor_sensors with their motor info (for boot initialization). */
  async getAllMotorSensors() {
    return this.prisma.motorSensor.findMany({
      include: { motor: true },
    });
  }
}
