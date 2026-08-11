import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LandingService } from './landing.service';
import { SubscribeDto } from './dto';

/**
 * Public landing endpoints — no auth required.
 * Captures subscription emails into Redis for later follow-up.
 */
@Controller('landing')
export class LandingController {
  constructor(private readonly landingService: LandingService) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  async subscribe(@Body() dto: SubscribeDto) {
    return this.landingService.subscribe(dto.email);
  }
}
