import { KnowledgeSearchService } from './knowledge-search.service';

describe('KnowledgeSearchService', () => {
  let service: KnowledgeSearchService;

  beforeEach(() => {
    // Create service with minimal mocks (we only test cosineSimilarity here)
    service = new KnowledgeSearchService(
      {} as any, // embeddingModel not needed for similarity tests
      { get: () => 0.65 } as any, // configService
    );
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical normalized vectors', () => {
      const v = [0.6, 0.8]; // already normalized (0.6² + 0.8² = 1)
      expect(service.cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(service.cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('should return -1.0 for opposite normalized vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(service.cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
    });

    it('should return correct similarity for known vectors', () => {
      // Two similar-ish vectors (normalized)
      const a = [0.5773, 0.5773, 0.5773]; // ≈ [1,1,1] normalized
      const b = [0.8165, 0.4082, 0.4082]; // ≈ [2,1,1] normalized
      // Expected: dot product ≈ 0.5773*0.8165 + 0.5773*0.4082 + 0.5773*0.4082 ≈ 0.9428
      expect(service.cosineSimilarity(a, b)).toBeCloseTo(0.9428, 3);
    });

    it('should return 0 for vectors of different lengths', () => {
      const a = [1, 0, 0];
      const b = [1, 0];
      expect(service.cosineSimilarity(a, b)).toBe(0);
    });

    it('should handle empty vectors', () => {
      expect(service.cosineSimilarity([], [])).toBe(0);
    });

    it('should handle 384-dimension vectors (actual embedding size)', () => {
      // Generate two random normalized vectors of 384 dims
      const a = new Array(384).fill(0).map(() => Math.random());
      const b = new Array(384).fill(0).map(() => Math.random());

      // Normalize them
      const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
      const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
      const normalizedA = a.map((v) => v / normA);
      const normalizedB = b.map((v) => v / normB);

      const result = service.cosineSimilarity(normalizedA, normalizedB);

      // Should be between -1 and 1
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });
  });
});
