# Spec 05 — Design

## Tech stack
| Component | Technology |
|---|---|
| Embeddings | `all-MiniLM-L6-v2` via `@xenova/transformers` (Node.js, CPU-only, 384 dimensions) |
| Vector storage | MongoDB (`embeddings` collection), cosine similarity computed in-process |
| LLM | Groq (`llama-3.3-70b-versatile`) via direct REST API (no LangChain) |
| Orchestration | Custom code in NestJS (`RagQueryService`) |
| Similarity threshold | env `RAG_SIMILARITY_THRESHOLD`, default 0.65 |

## Mongo collection
```
embeddings { _id, chunk_text, vector: number[384], topic, source_reference, created_at }
```
Content: hand-written fragments based on ISO 10816-3, NEMA MG-1, and typical troubleshooting guides
(imbalance, misalignment, bearing degradation, overcurrent). Each fragment cites its source in
`source_reference` (see `docs/05-thresholds-sources.md`).

## Services
- `LiveContextService`: builds context blocks 1+2 (Redis + recent alerts/status from MySQL).
- `KnowledgeSearchService`: vectorizes user's question with `@xenova/transformers` (all-MiniLM-L6-v2),
  loads all vectors from `embeddings` (they're ~20, fit in memory), computes cosine similarity in-process,
  returns top-K (K=3) above `RAG_SIMILARITY_THRESHOLD`.
- `RagQueryService`: orchestrates both, assembles the final prompt, calls Groq via HTTP, applies the
  "no hallucination" rules before returning the response (post-processes/filters if the LLM mentions a
  value from a sensor marked fault).

## Endpoint
`POST /rag/query { motor_id?, question }` → if `motor_id` is not provided, assumes a general question
(uses only knowledge base, no live context).

## Environment variables
```
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
RAG_SIMILARITY_THRESHOLD=0.65
```
