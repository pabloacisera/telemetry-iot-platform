import { LiveContextService } from './live-context.service';
import type { PrismaService } from '../prisma';
import type { CacheService } from '../cache/cache.service';

interface SensorSnapshot {
  motorSensorId: number;
  sensorType: string;
  value: number | null;
  status: string;
  recordedAt: string | null;
  healthyMax: number;
  warningMax: number;
  criticalMax: number;
}

interface SensorReadingHistory {
  sensorType: string;
  readings: { value: number; recordedAt: Date }[];
  avgValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  anomalyCount: number;
  deltaValue: number | null;
  direction: 'rising' | 'falling' | 'stable';
  pctAboveWarning: number | null;
}

interface LiveContext {
  motorId: number;
  motorCode: string;
  motorName: string;
  motorStatus: string;
  ratedCurrentA: number;
  insulationClass: string;
  sensors: SensorSnapshot[];
  sensorHistory: SensorReadingHistory[];
  recentAlerts: { type: string; triggeredAt: Date; resolvedAt: Date | null }[];
  recentStatusChanges: {
    fromStatus: string | null;
    toStatus: string | null;
    changedAt: Date;
  }[];
  trips24h: {
    count: number;
    lastTripAt: Date | null;
    minutesSinceLastTrip: number | null;
  };
  alarms24h: number;
}

function makeContext(overrides: Partial<LiveContext> = {}): LiveContext {
  const ctx: LiveContext = {
    motorId: 1,
    motorCode: 'M-01',
    motorName: 'Bomba principal',
    motorStatus: 'healthy',
    ratedCurrentA: 10,
    insulationClass: 'F',
    sensors: [
      {
        motorSensorId: 1,
        sensorType: 'vibration',
        value: 3.0,
        status: 'ok',
        recordedAt: null,
        healthyMax: 1.8,
        warningMax: 4.5,
        criticalMax: 7.1,
      },
      {
        motorSensorId: 2,
        sensorType: 'current',
        value: 11.0,
        status: 'ok',
        recordedAt: null,
        healthyMax: 10,
        warningMax: 11.5,
        criticalMax: 12.5,
      },
      {
        motorSensorId: 3,
        sensorType: 'temperature',
        value: 75,
        status: 'ok',
        recordedAt: null,
        healthyMax: 70,
        warningMax: 90,
        criticalMax: 95,
      },
    ],
    sensorHistory: [
      {
        sensorType: 'vibration',
        readings: [],
        avgValue: 3.0,
        minValue: 2.5,
        maxValue: 3.5,
        anomalyCount: 0,
        deltaValue: 0.5,
        direction: 'rising',
        pctAboveWarning: 0,
      },
      {
        sensorType: 'current',
        readings: [],
        avgValue: 11.0,
        minValue: 10.5,
        maxValue: 11.5,
        anomalyCount: 0,
        deltaValue: 0.5,
        direction: 'rising',
        pctAboveWarning: 0,
      },
      {
        sensorType: 'temperature',
        readings: [],
        avgValue: 75,
        minValue: 72,
        maxValue: 78,
        anomalyCount: 0,
        deltaValue: 1,
        direction: 'rising',
        pctAboveWarning: 0,
      },
    ],
    recentAlerts: [],
    recentStatusChanges: [],
    trips24h: { count: 0, lastTripAt: null, minutesSinceLastTrip: null },
    alarms24h: 0,
  };
  return { ...ctx, ...overrides };
}

describe('LiveContextService — correlation gating by sensor status', () => {
  let service: LiveContextService;

  beforeEach(() => {
    service = new LiveContextService(
      {} as unknown as PrismaService,
      {} as unknown as CacheService,
    );
  });

  describe('vibración + corriente en alza', () => {
    it('emite la correlación cuando ambos sensores son confiables', () => {
      const out = service.formatForPrompt(makeContext());
      expect(out).toContain(
        'Correlación: vibración y corriente suben simultáneamente',
      );
    });

    it('no emite la correlación y advierte que NO es confiable si vibración está en fault', () => {
      const ctx = makeContext();
      ctx.sensors[0].status = 'fault';
      const out = service.formatForPrompt(ctx);
      expect(out).not.toContain(
        'Correlación: vibración y corriente suben simultáneamente',
      );
      expect(out).toContain('NO es confiable');
      expect(out).toContain('sensor de vibration');
    });

    it('no emite la correlación y advierte si current está en fault_persistent', () => {
      const ctx = makeContext();
      ctx.sensors[1].status = 'fault_persistent';
      const out = service.formatForPrompt(ctx);
      expect(out).not.toContain(
        'Correlación: vibración y corriente suben simultáneamente',
      );
      expect(out).toContain('NO es confiable');
      expect(out).toContain('sensor de current');
    });

    it('no emite la correlación y advierte si current está en stuck', () => {
      const ctx = makeContext();
      ctx.sensors[1].status = 'stuck';
      const out = service.formatForPrompt(ctx);
      expect(out).not.toContain(
        'Correlación: vibración y corriente suben simultáneamente',
      );
      expect(out).toContain('NO es confiable');
    });

    it('advierte con ambos sensores en falla', () => {
      const ctx = makeContext();
      ctx.sensors[0].status = 'fault';
      ctx.sensors[1].status = 'fault';
      const out = service.formatForPrompt(ctx);
      expect(out).toContain('sensor de vibration y current');
    });
  });

  describe('temperatura + corriente en alza', () => {
    function makeTempCurrentRising() {
      const ctx = makeContext();
      // Baja vibración para que no gane el primer bloque de correlación
      ctx.sensorHistory[0].direction = 'stable';
      ctx.sensorHistory[1].direction = 'rising';
      ctx.sensorHistory[2].direction = 'rising';
      return ctx;
    }

    it('emite la correlación cuando ambos sensores son confiables', () => {
      const out = service.formatForPrompt(makeTempCurrentRising());
      expect(out).toContain(
        'Correlación: temperatura y corriente suben juntas',
      );
    });

    it('no emite la correlación si temperature está en fault', () => {
      const ctx = makeTempCurrentRising();
      ctx.sensors[2].status = 'fault';
      const out = service.formatForPrompt(ctx);
      expect(out).not.toContain(
        'Correlación: temperatura y corriente suben juntas',
      );
      expect(out).toContain('NO es confiable');
      expect(out).toContain('sensor de temperature');
    });

    it('no emite la correlación si current está en fault_persistent', () => {
      const ctx = makeTempCurrentRising();
      ctx.sensors[1].status = 'fault_persistent';
      const out = service.formatForPrompt(ctx);
      expect(out).not.toContain(
        'Correlación: temperatura y corriente suben juntas',
      );
      expect(out).toContain('NO es confiable');
    });
  });

  describe('sin correlación posible', () => {
    it('no agrega correlaciones si no hay tendencias crecientes', () => {
      const ctx = makeContext();
      ctx.sensorHistory[0].direction = 'stable';
      ctx.sensorHistory[1].direction = 'stable';
      ctx.sensorHistory[2].direction = 'stable';
      const out = service.formatForPrompt(ctx);
      expect(out).not.toContain('Correlación:');
      expect(out).not.toContain('NO es confiable');
    });
  });
});
