import { LandingService } from './landing.service';
import type { CacheService } from '../cache';

describe('LandingService', () => {
  let service: LandingService;
  let cache: { saveLead: jest.Mock };

  beforeEach(() => {
    cache = { saveLead: jest.fn() };
    service = new LandingService(cache as unknown as CacheService);
  });

  it('normalizes the email and registers the lead', async () => {
    cache.saveLead.mockResolvedValue(true);
    const result = await service.subscribe('  User@Example.COM  ');

    expect(cache.saveLead).toHaveBeenCalledWith('user@example.com');
    expect(result).toEqual({
      subscribed: true,
      email: 'user@example.com',
      firstTime: true,
    });
  });

  it('reports firstTime=false when the lead already exists', async () => {
    cache.saveLead.mockResolvedValue(false);
    const result = await service.subscribe('user@example.com');

    expect(result.firstTime).toBe(false);
  });
});
