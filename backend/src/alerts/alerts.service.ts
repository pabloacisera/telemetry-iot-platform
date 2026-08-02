import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma';

/**
 * Service for alert management (query and resolution).
 *
 * Resolution uses optimistic locking:
 * UPDATE ... WHERE resolved_at IS NULL → if 0 rows affected, another user resolved it first.
 * This avoids race conditions without pessimistic locks or extra DB round-trips.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get all unresolved (active) alerts, newest first. */
  async getActive() {
    return this.prisma.alert.findMany({
      where: { resolvedAt: null },
      orderBy: { triggeredAt: 'desc' },
    });
  }

  /** Get alerts for a specific motor (resolved and unresolved), newest first. */
  async getByMotor(motorId: number) {
    return this.prisma.alert.findMany({
      where: { motorId },
      orderBy: { triggeredAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Resolve an alert with optimistic locking.
   * Throws 409 Conflict if already resolved by another user.
   */
  async resolve(alertId: number, userId: number, note?: string): Promise<void> {
    const result = await this.prisma.$executeRaw`
      UPDATE alerts
      SET resolved_at = NOW(), resolved_by = ${userId}, resolution_note = ${note || null}
      WHERE id = ${alertId} AND resolved_at IS NULL
    `;

    if (result === 0) {
      throw new ConflictException('Alert already resolved by another user');
    }
  }
}
