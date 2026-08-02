import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Vectorized knowledge fragment for the RAG module.
 * Each document represents a maintenance/troubleshooting snippet grounded in
 * ISO/NEMA standards, with its embedding vector for cosine similarity search.
 */
@Schema({
  collection: 'embeddings',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class Embedding extends Document {
  @Prop({ required: true, type: String })
  chunk_text!: string;

  @Prop({ required: true, type: [Number] })
  vector!: number[];

  @Prop({ required: true, type: String })
  topic!: string;

  @Prop({ required: true, type: String })
  source_reference!: string;
}

export const EmbeddingSchema = SchemaFactory.createForClass(Embedding);
