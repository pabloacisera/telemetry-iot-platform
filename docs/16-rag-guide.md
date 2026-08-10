# RAG Module — Developer Guide

## What is this and why is it the fifth piece built

The RAG (Retrieval-Augmented Generation) module is a natural language assistant that answers operators'
questions about the **current state** of the plant. It combines live data (Redis snapshot + recent alerts)
with a vectorized knowledge base (maintenance documents grounded in ISO/NEMA standards) and an LLM to
produce contextual, trustworthy answers.

It is built fifth because:
- It depends on the backend core (spec 02) for live data access (Redis snapshot, alerts, status history).
- It depends on auth (spec 03) to protect the endpoint.
- It depends on the frontend (spec 04) having the `RagQueryBox` component ready to consume it.
- The full telemetry pipeline must be working so the RAG can answer about real, flowing data.

## What problem it solves

An operator monitoring 15 motors shouldn't need to memorize ISO thresholds or mentally correlate
sensor readings with failure modes. The RAG:
- Translates raw numbers into actionable plain-language explanations.
- Cross-references current readings with documented failure patterns (imbalance, bearing degradation, etc.).
- Explicitly refuses to speculate when data is missing or unreliable — a safety-critical property in
  industrial monitoring.

## How it works (high level)

```
Operator asks a question → POST /rag/query { motor_id?, question }
  → LiveContextService: reads Redis snapshot + recent alerts/status history for that motor
  → KnowledgeSearchService: vectorizes the question, searches embeddings by cosine similarity
  → RagQueryService: assembles prompt (live context + knowledge fragments + question)
  → Calls Groq LLM (llama-3.3-70b-versatile) via REST
  → Anti-hallucination filter: strips/rewrites any claim about a sensor in fault state
  → Returns response to frontend
```

## Tech stack decisions

| Decision | Rationale |
|---|---|
| `all-MiniLM-L6-v2` via `@xenova/transformers` | Runs locally in Node.js (CPU-only), no external embedding API needed. 384 dimensions, sufficient for ~20 knowledge fragments. |
| MongoDB `embeddings` collection | The knowledge base is small (~20 fragments); a dedicated vector DB (pgvector, Qdrant) would be overengineered. |
| Cosine similarity computed in-process | With ~20 vectors of 384 dims, loading them all into memory and computing similarity is trivial — no index needed. |
| Groq (`llama-3.3-70b-versatile`) | Free tier, fast inference, good quality. Direct REST call — no SDK framework needed. |
| No LangChain | A single orchestrated LLM call with a hand-crafted prompt doesn't justify a framework dependency. Custom code is simpler, more debuggable, and has fewer moving parts. |
| Similarity threshold (0.65 default) | Configurable via `RAG_SIMILARITY_THRESHOLD` env var. Below this, the system says "insufficient information" instead of forcing a weak match. |

## The three response modes (non-negotiable behavior)

1. **Healthy data available** — the motor has recent readings from sensors in `ok` state. The RAG answers
   normally, citing values and correlating with knowledge base documents.

2. **Unreliable sensor** — one or more sensors are in `fault`/`fault_persistent`/`stuck`. The RAG
   explicitly flags which sensor is unreliable, does NOT repeat its value as a verified fact, and limits
   its answer to what it can confirm from healthy sensors.

3. **No data / historical question** — the sensor is disconnected (no Redis data), or the operator asks
   about deep history ("how was it last week?"). The RAG responds with an explicit redirection to Grafana,
   without attempting to reconstruct history it doesn't have.

## The anti-hallucination filter (why it exists)

LLMs can confidently assert values they were given in context, even if those values came from a broken
sensor. The anti-hallucination filter is a post-processing step that:
- Checks if the LLM response mentions a numerical value from a sensor currently in `fault` state.
- If so, rewrites that part with a "data unreliable" warning.
- This is a **safety property**: in industrial monitoring, acting on a stuck/broken sensor value could
  cause real damage (e.g., thinking a motor is fine when it's overheating).

## Knowledge base content

The `embeddings` collection contains hand-written fragments based on:
- **ISO 10816-3** — vibration severity zones for Class I motors.
- **NEMA MG-1** — insulation classes, temperature limits, overcurrent thresholds.
- **Typical troubleshooting patterns** — imbalance, misalignment, bearing degradation, overcurrent causes.

Each fragment includes a `source_reference` field linking back to `docs/05-thresholds-sources.md`.
This is intentional: the RAG's answers are grounded in the same cited standards that define the
system's thresholds, creating full traceability from detection to explanation.

## Services breakdown

| Service | Responsibility |
|---|---|
| `LiveContextService` | Reads Redis snapshot (last value + status per sensor) + queries recent alerts/status changes from MySQL. Builds context blocks 1+2. |
| `KnowledgeSearchService` | Vectorizes the user's question with `@xenova/transformers`, loads all vectors from Mongo, computes cosine similarity, returns top-3 above threshold. |
| `RagQueryService` | Orchestrates both services, assembles the final prompt, calls Groq, applies the anti-hallucination filter, returns the response. |

## Endpoint

```
POST /rag/query
Body: { motor_id?: number, question: string }
```

- If `motor_id` is provided → includes live context (Redis + recent history) in the prompt.
- If `motor_id` is omitted → general question, uses only the knowledge base (no live context).

## Environment variables

```
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
RAG_SIMILARITY_THRESHOLD=0.65
```

## How to run (once built)

```bash
# Requires MongoDB running with the embeddings collection seeded
cd backend/
npm run seed:embeddings   # loads knowledge fragments into Mongo
npm run start:dev         # RAG module loads with the rest of the backend
```

## Markdown rendering in the frontend

Assistant responses are rendered with `react-markdown` in `RagQueryBox.tsx`, with the GFM
extension enabled (`remark-gfm@^4`) so **tables and lists** render properly (GFM pipe tables
were previously shown as raw text). `.rag-markdown` has `overflow-x: auto` so wide tables
scroll horizontally instead of overflowing the card.

## What this does NOT do

- Does not replace Grafana for historical analysis (explicitly redirects there).
- Does not invent data when a sensor is broken (anti-hallucination filter).
- Does not use LangChain or any orchestration framework.
- Does not query MySQL for raw readings (uses Redis snapshot for "now", brief summary for "recent").
- Does not store conversation history server-side (the frontend's `ragSlice` holds session context).
