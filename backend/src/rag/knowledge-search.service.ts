import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Embedding } from './embedding.schema';

/**
 * Vectorizes user questions and searches the knowledge base by cosine similarity.
 *
 * The embeddings collection is small (~20 fragments), so all vectors are loaded
 * into memory and similarity is computed in-process — no vector index needed.
 */
@Injectable()
export class KnowledgeSearchService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeSearchService.name);
  private pipeline: any = null;
  private readonly similarityThreshold: number;

  constructor(
    @InjectModel(Embedding.name)
    private readonly embeddingModel: Model<Embedding>,
    private readonly configService: ConfigService,
  ) {
    this.similarityThreshold = this.configService.get<number>(
      'RAG_SIMILARITY_THRESHOLD',
      0.55,
    );
  }

  async onModuleInit() {
    await this.loadPipeline();
  }

  /** Lazily load the embedding pipeline (all-MiniLM-L6-v2). */
  private async loadPipeline(): Promise<void> {
    try {
      const { pipeline } = await import('@xenova/transformers');
      const modelName = this.configService.get<string>(
        'EMBEDDING_MODEL',
        'Xenova/all-MiniLM-L6-v2',
      );
      this.pipeline = await pipeline('feature-extraction', modelName);
      this.logger.log(`Embedding model loaded: ${modelName}`);
    } catch (error) {
      this.logger.error(
        `Failed to load embedding model: ${(error as Error).message}`,
      );
    }
  }

  /** Vectorize a text string into a 384-dimension float array. */
  async vectorize(text: string): Promise<number[]> {
    if (!this.pipeline) {
      await this.loadPipeline();
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return Array.from(output.data as Float32Array);
  }

  /**
   * Compute cosine similarity between two vectors.
   * Assumes both are already normalized (unit length), so dot product = cosine.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Search the knowledge base for the top-K fragments most similar to the query.
   * Only returns results above the configured similarity threshold.
   */
  async search(
    question: string,
    topK = 5,
  ): Promise<
    {
      chunkText: string;
      topic: string;
      sourceReference: string;
      score: number;
    }[]
  > {
    const queryVector = await this.vectorize(question);

    // Load all embeddings (small set, fits in memory)
    const allEmbeddings = await this.embeddingModel.find().lean().exec();

    // Compute similarities
    const scored = allEmbeddings
      .map((doc) => ({
        chunkText: doc.chunk_text,
        topic: doc.topic,
        sourceReference: doc.source_reference,
        score: this.cosineSimilarity(queryVector, doc.vector),
      }))
      .filter((item) => item.score >= this.similarityThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    this.logger.debug(
      `Knowledge search: ${scored.length} results above threshold (${this.similarityThreshold})`,
    );

    return scored;
  }
}
