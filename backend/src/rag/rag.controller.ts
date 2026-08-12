import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { RagQueryService } from './rag-query.service';
import { RagQueryDto } from './dto/rag-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Endpoint for the RAG natural language assistant.
 * Protected by JWT auth — any authenticated user can query.
 */
@Controller('rag')
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private readonly ragQueryService: RagQueryService) {}

  @Post('query')
  async query(@Body() dto: RagQueryDto) {
    return this.ragQueryService.query(
      dto.motor_id,
      dto.question,
      dto.history ?? [],
    );
  }
}
