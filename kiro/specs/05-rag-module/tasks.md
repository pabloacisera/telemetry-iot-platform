# Spec 05 — Tasks

1. Mongo connection (Mongoose) + `embeddings` collection.
2. Write and load (seed) the knowledge base fragments with their `source_reference`.
3. `KnowledgeSearchService` (embeddings + in-process cosine similarity).
4. `LiveContextService` (Redis read + recent `alerts`/`motor_status_history`).
5. `RagQueryService` (orchestration + Groq LLM call + anti-hallucination filter for fault sensors).
6. Endpoint `POST /rag/query` + DTO.
7. Explicit handling of the 3 responses: healthy data, unreliable sensor, no data / redirect to Grafana.
8. Unit tests for cosine similarity and the anti-hallucination filter.
