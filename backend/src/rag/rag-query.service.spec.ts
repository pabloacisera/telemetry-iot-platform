import { RagQueryService } from './rag-query.service';

describe('RagQueryService', () => {
  let service: RagQueryService;

  beforeEach(() => {
    service = new RagQueryService(
      {} as any, // liveContextService
      {} as any, // knowledgeSearchService
      { get: (key: string, def?: string) => def ?? '' } as any, // configService
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
      expect(result).toContain('FAULT state');
      expect(result).toContain('UNRELIABLE');
      expect(result).not.toContain('3.2 mm/s');
    });

    it('should replace temperature value citation when temperature sensor is in fault', () => {
      const response =
        'The temperature sensor reads 85°C, above the warning threshold.';
      const result = service.applyAntiHallucinationFilter(response, [
        'temperature',
      ]);
      expect(result).toContain('FAULT state');
      expect(result).toContain('UNRELIABLE');
      expect(result).not.toContain('85°C');
    });

    it('should replace current value citation when current sensor is in fault', () => {
      const response =
        'Current draw is 15.2 A, which exceeds the rated current.';
      const result = service.applyAntiHallucinationFilter(response, [
        'current',
      ]);
      expect(result).toContain('FAULT state');
      expect(result).toContain('UNRELIABLE');
      expect(result).not.toContain('15.2 A');
    });

    it('should handle multiple fault sensors simultaneously', () => {
      const response =
        'Vibration at 4.8 mm/s and temperature at 92°C suggest immediate attention. Current is normal at 10 A.';
      const result = service.applyAntiHallucinationFilter(response, [
        'vibration',
        'temperature',
        'current',
      ]);
      expect(result).not.toContain('4.8 mm/s');
      expect(result).not.toContain('92°C');
      expect(result).not.toContain('10 A');
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
      expect(result).toContain('UNRELIABLE');
      expect(result).not.toContain('5.1 mm/s');
    });
  });
});
