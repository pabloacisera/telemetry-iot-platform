import { StatusTransitionService } from './status-transition.service';
import type { PrismaService } from '../prisma';
import type { RealtimeGateway } from '../realtime';

describe('StatusTransitionService — createAlert anti-flood', () => {
  let service: StatusTransitionService;
  let prisma: {
    alert: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };
  let realtime: { emitAlert: jest.Mock };

  // The production throttle (ALERT_THROTTLE_MS) defaults to 5 min; tests pin
  // it to 60s so the window fits comfortably inside fake-timer advancement.
  beforeAll(() => {
    process.env.ALERT_THROTTLE_MS = '60000';
  });

  afterAll(() => {
    delete process.env.ALERT_THROTTLE_MS;
  });

  beforeEach(() => {
    prisma = {
      alert: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 1,
          motorId: 7,
          type: 'motor_alarm',
          metadata: null,
          triggeredAt: new Date(),
        }),
      },
    };
    realtime = {
      emitAlert: jest.fn(),
    };

    service = new StatusTransitionService(
      prisma as unknown as PrismaService,
      realtime as unknown as RealtimeGateway,
    );
  });

  it('should create an alert when no alert exists for that motor/type', async () => {
    prisma.alert.findFirst.mockResolvedValue(null);

    await service.createAlert(7, 'motor_alarm', { reason: 'overcurrent' });

    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ motorId: 7, type: 'motor_alarm' }),
    });
    expect(realtime.emitAlert).toHaveBeenCalledWith(7, expect.any(Object));
  });

  it('should skip when the same type is still open (existing behaviour)', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 5,
      resolvedAt: null,
      triggeredAt: new Date(),
    });

    await service.createAlert(7, 'motor_alarm', { reason: 'overcurrent' });

    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(realtime.emitAlert).not.toHaveBeenCalled();
  });

  it('should skip when the latest alert of the same type was resolved recently (within throttle)', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 5,
      resolvedAt: new Date(),
      triggeredAt: new Date(Date.now() - 30_000), // 30s ago < 60s window
    });

    await service.createAlert(7, 'motor_alarm', { reason: 'overcurrent' });

    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(realtime.emitAlert).not.toHaveBeenCalled();
  });

  it('should create again once the throttle window has passed', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 5,
      resolvedAt: new Date(),
      triggeredAt: new Date(Date.now() - 61_000), // > 60s window
    });

    await service.createAlert(7, 'motor_alarm', { reason: 'overcurrent' });

    expect(prisma.alert.create).toHaveBeenCalled();
    expect(realtime.emitAlert).toHaveBeenCalled();
  });

  it('should create for a different type within the throttle window', async () => {
    // Throttle is scoped per (motorId, type): a recent motor_alarm must not
    // block a new motor_trip for the same motor.
    prisma.alert.findFirst.mockImplementation((args) => {
      if (args.where.type === 'motor_alarm') {
        return Promise.resolve({
          id: 5,
          resolvedAt: new Date(),
          triggeredAt: new Date(Date.now() - 10_000),
        });
      }
      return Promise.resolve(null);
    });

    await service.createAlert(7, 'motor_trip', { reason: 'critical_reading' });

    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ motorId: 7, type: 'motor_trip' }),
    });
    expect(realtime.emitAlert).toHaveBeenCalled();
  });

  it('should create for a different motor within the throttle window', async () => {
    // Throttle is scoped per (motorId, type): a recent alert on motor 7 must
    // not block a new alert on motor 8.
    prisma.alert.findFirst.mockImplementation((args) => {
      if (args.where.motorId === 7) {
        return Promise.resolve({
          id: 5,
          resolvedAt: new Date(),
          triggeredAt: new Date(Date.now() - 10_000),
        });
      }
      return Promise.resolve(null);
    });

    await service.createAlert(8, 'motor_alarm', { reason: 'overcurrent' });

    expect(prisma.alert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ motorId: 8, type: 'motor_alarm' }),
      }),
    );
    expect(prisma.alert.create).toHaveBeenCalled();
    expect(realtime.emitAlert).toHaveBeenCalled();
  });
});
