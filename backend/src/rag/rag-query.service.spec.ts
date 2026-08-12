import { RagQueryService } from './rag-query.service';
import type { LiveContextService } from './live-context.service';
import type { KnowledgeSearchService } from './knowledge-search.service';
import type { ConfigService } from '@nestjs/config';

describe('RagQueryService', () => {
  let service: RagQueryService;

  beforeEach(() => {
    service = new RagQueryService(
      {} as unknown as LiveContextService,
      {} as unknown as KnowledgeSearchService,
      {
        get: (key: string, def?: string) => def ?? '',
      } as unknown as ConfigService,
    );
  });

  describe('applyAntiHallucinationFilter', () => {
    it('should return response unchanged when no sensors are in fault', () => {
      const response =
        'Motor 7 vibration is at 3.2 mm/s, which is in warning zone.';
      const result = service.applyAntiHallucinationFilter(response, []);
      expect(result).toBe(response);
    });

    it('should replace vibration value citation when vibration sensor is in fault', () => {
      const response =
        'Motor 7 vibration is at 3.2 mm/s, which indicates bearing degradation.';
      const result = service.applyAntiHallucinationFilter(response, [
        'vibration',
      ]);
      expect(result).toContain('3.2 mm/s');
      expect(result).toContain('⚠️(sensor en falla)');
    });

    it('should replace temperature value citation when temperature sensor is in fault', () => {
      const response =
        'The temperature sensor reads 85°C, above the warning threshold.';
      const result = service.applyAntiHallucinationFilter(response, [
        'temperature',
      ]);
      expect(result).toContain('85');
      expect(result).toContain('⚠️(sensor en falla)');
    });

    it('should replace current value citation when current sensor is in fault', () => {
      const response =
        'Current draw is 15.2 A, which exceeds the rated current.';
      const result = service.applyAntiHallucinationFilter(response, [
        'current',
      ]);
      expect(result).toContain('15.2 A');
      expect(result).toContain('⚠️(sensor en falla)');
    });

    it('should handle multiple fault sensors simultaneously', () => {
      const response =
        'Vibration at 4.8 mm/s and temperature at 92°C suggest immediate attention. Current is normal at 10 A.';
      const result = service.applyAntiHallucinationFilter(response, [
        'vibration',
        'temperature',
        'current',
      ]);
      expect(result).toContain('4.8 mm/s');
      expect(result).toContain('92');
      expect(result).toContain('10 A');
      // All three sensors should have the fault warning appended
      const warningCount = (result.match(/⚠️\(sensor en falla\)/g) ?? [])
        .length;
      expect(warningCount).toBe(3);
    });

    it('should not modify text that mentions the sensor type without a value', () => {
      const response =
        'The vibration sensor is currently in fault state and cannot provide reliable data.';
      const result = service.applyAntiHallucinationFilter(response, [
        'vibration',
      ]);
      // No numeric value with unit to replace, so text should remain mostly unchanged
      expect(result).toContain('vibration sensor is currently in fault state');
    });

    it('should handle response with no relevant sensor mentions', () => {
      const response =
        'Motor 7 is currently healthy. All parameters are within normal range.';
      const result = service.applyAntiHallucinationFilter(response, [
        'vibration',
      ]);
      expect(result).toBe(response);
    });

    it('should be case-insensitive for sensor type matching', () => {
      const response =
        'VIBRATION levels are at 5.1 mm/s indicating critical zone.';
      const result = service.applyAntiHallucinationFilter(response, [
        'vibration',
      ]);
      expect(result).toContain('5.1 mm/s');
      expect(result).toContain('⚠️(sensor en falla)');
    });
  });

  describe('callGroq — temperature', () => {
    it('uses temperature 0.7 in the Groq request body', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Respuesta de prueba' } }],
          }),
      });
      global.fetch = fetchMock;

      // callGroq is private; exercise it through query() with a question that
      // yields no live context and no knowledge matches is impossible (early
      // return), so use a motor context path with mocked deps.
      const liveCtx = {
        buildContext: jest.fn().mockResolvedValue({
          motorId: 7,
          motorCode: 'M-07',
          motorName: 'Motor 7',
          motorStatus: 'healthy',
          ratedCurrentA: 10,
          insulationClass: 'F',
          sensors: [
            {
              motorSensorId: 1,
              sensorType: 'vibration',
              value: 2.5,
              status: 'ok',
              recordedAt: null,
              healthyMax: 1.8,
              warningMax: 4.5,
              criticalMax: 7.1,
            },
          ],
          sensorHistory: [],
          recentAlerts: [],
          recentStatusChanges: [],
          trips24h: { count: 0, lastTripAt: null, minutesSinceLastTrip: null },
          alarms24h: 0,
        }),
        formatForPrompt: jest.fn().mockReturnValue('CONTEXTO'),
      } as unknown as LiveContextService;
      const knowledge = {
        search: jest.fn().mockResolvedValue([
          {
            topic: 'vibration_thresholds',
            chunkText: 'ISO 10816-3 zone limits',
            sourceReference: 'ISO 10816-3',
          },
        ]),
      } as unknown as KnowledgeSearchService;

      const svc = new RagQueryService(liveCtx, knowledge, {
        get: (key: string, def?: string) =>
          key === 'GROQ_API_KEY' ? 'test-key' : (def ?? ''),
      } as unknown as ConfigService);

      await svc.query(7, '¿Cómo está el motor?');

      const fetchCalls = fetchMock.mock.calls as unknown as [
        string,
        { body: string },
      ][];
      const capturedBody = JSON.parse(fetchCalls[0][1].body) as Record<
        string,
        unknown
      >;
      expect(capturedBody).toHaveProperty('temperature', 0.7);
      expect(capturedBody).toHaveProperty('max_tokens', 1024);
    });
  });
});
