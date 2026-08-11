import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache';

/**
 * Landing subscription service — captures leads from the public landing page.
 * Emails are stored in Redis only for now (pre-email-system).
 */
@Injectable()
export class LandingService {
  constructor(private readonly cacheService: CacheService) {}

  async subscribe(email: string): Promise<{
    subscribed: boolean;
    email: string;
    firstTime: boolean;
  }> {
    const normalized = email.trim().toLowerCase();
    const added = await this.cacheService.saveLead(normalized);
    return { subscribed: true, email: normalized, firstTime: added };
  }
}
