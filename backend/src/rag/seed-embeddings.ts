/**
 * Seed script for the RAG knowledge base.
 * Vectorizes each knowledge fragment with all-MiniLM-L6-v2 and stores in MongoDB.
 *
 * Usage: npx ts-node src/rag/seed-embeddings.ts
 * Or via npm script: npm run seed:embeddings
 */
import * as mongoose from 'mongoose';
import { KNOWLEDGE_FRAGMENTS } from './knowledge-fragments';

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/rag_knowledge';
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

const embeddingSchema = new mongoose.Schema(
  {
    chunk_text: { type: String, required: true },
    vector: { type: [Number], required: true },
    topic: { type: String, required: true },
    source_reference: { type: String, required: true },
  },
  {
    collection: 'embeddings',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  },
);

async function main() {
  console.log(`Connecting to MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);

  const EmbeddingModel = mongoose.model('Embedding', embeddingSchema);

  // Clear existing embeddings
  const deleted = await EmbeddingModel.deleteMany({});
  console.log(`Cleared ${deleted.deletedCount} existing embeddings.`);

  // Load embedding pipeline
  console.log(`Loading embedding model: ${EMBEDDING_MODEL}...`);
  const { pipeline } = await import('@xenova/transformers');
  const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
  console.log('Model loaded.');

  // Vectorize and insert each fragment
  console.log(`Processing ${KNOWLEDGE_FRAGMENTS.length} fragments...`);

  for (let i = 0; i < KNOWLEDGE_FRAGMENTS.length; i++) {
    const fragment = KNOWLEDGE_FRAGMENTS[i];

    const output = await extractor(fragment.chunk_text, {
      pooling: 'mean',
      normalize: true,
    });

    const vector = Array.from(output.data as Float32Array);

    await EmbeddingModel.create({
      chunk_text: fragment.chunk_text,
      vector,
      topic: fragment.topic,
      source_reference: fragment.source_reference,
    });

    console.log(
      `  [${i + 1}/${KNOWLEDGE_FRAGMENTS.length}] ${fragment.topic} ✓`,
    );
  }

  console.log(
    `\nDone! ${KNOWLEDGE_FRAGMENTS.length} fragments seeded into MongoDB.`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
