import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Embedding, EmbeddingSchema } from './embedding.schema';
import { RagController } from './rag.controller';
import { RagQueryService } from './rag-query.service';
import { LiveContextService } from './live-context.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { PrismaModule } from '../prisma';
import { CacheModule } from '../cache';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGO_URI',
          'mongodb://localhost:27017/rag_knowledge',
        ),
      }),
    }),
    MongooseModule.forFeature([
      { name: Embedding.name, schema: EmbeddingSchema },
    ]),
    PrismaModule,
    CacheModule,
  ],
  controllers: [RagController],
  providers: [RagQueryService, LiveContextService, KnowledgeSearchService],
  exports: [RagQueryService],
})
export class RagModule {}
