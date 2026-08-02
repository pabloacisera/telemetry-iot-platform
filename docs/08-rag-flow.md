# RAG Module Flow

## Concrete tech stack
| Component | Technology | Rationale |
|---|---|---|
| Embeddings | `all-MiniLM-L6-v2` via `@xenova/transformers` (Node.js, CPU-only, 384 dimensions) | Runs locally without external API, decoupled from LLM, sufficient for 15-20 fragments. |
| Vector DB | MongoDB (`embeddings` collection, cosine similarity computed in-process) | Knowledge base is small; doesn't justify pgvector or FAISS. |
| LLM | Groq (`llama-3.3-70b-versatile`) via direct REST API | Free, fast, good quality. No LangChain (a single orchestrated call doesn't justify it). |
| Orchestration | Custom code in NestJS (`RagQueryService`) | Manually crafted prompt, no framework dependency. |
| Similarity threshold | `RAG_SIMILARITY_THRESHOLD` env var, default 0.65 | Adjustable empirically against real questions. |

## Environment variables
```
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
RAG_SIMILARITY_THRESHOLD=0.65
```

## Scope (final decision after design iteration)
The RAG answers about the **now** of the plant, never about deep history — that's exclusively Grafana's
responsibility. Two non-negotiable principles:
1. **Only states what it has recent data for.** If a sensor has no recent reading (fault: disconnected),
   it says so explicitly.
2. **Only trusts healthy data.** If a sensor is in `fault`/`stuck`/`fault_persistent`, the RAG flags that
   the data is unreliable, never repeats it as a verified fact.

## Steps of a query (`POST /rag/query { motor_id?, question }`)

1. **LiveContextService** — if `motor_id` is provided: reads the live snapshot from Redis (last value +
   status of each of the 3 sensors) and a brief recent summary (last alerts/status changes from
   `alerts`/`motor_status_history`, NOT the complete history).
2. **KnowledgeSearchService** — vectorizes the operator's question, computes cosine similarity in-process
   against the `embeddings` collection in Mongo, returns the top-3 most relevant fragments (only if they
   exceed the minimum similarity threshold).
3. **RagQueryService** — assembles the prompt combining (1) live snapshot + recent summary, (2) knowledge
   fragments, (3) the original question. Calls Groq (`llama-3.3-70b-versatile`) via REST API.
4. **Anti-hallucination filter** — before returning the response, verifies that it's not citing as a
   verified fact the value of a sensor marked `fault`. If the LLM did so, that part is rewritten with a
   "data unreliable" warning.
5. If the question is about deep history ("how was it last week?"), responds with a fixed redirection to
   Grafana, without trying to reconstruct that history from partial data.
6. If there are no relevant knowledge fragments above the threshold, responds indicating insufficient
   information, without inventing a cause.

## Example of the 3 possible responses
- **Healthy data**: "Motor 7 is under review: vibration at 3.2 mm/s (warning zone per ISO 10816-3),
  temperature and current are normal. This typically indicates imbalance or bearing wear."
- **Unreliable sensor**: "Motor 7's vibration sensor is marked as failed (stuck reading), I cannot confirm
  the actual value. Temperature and current are within healthy range."
- **No data / historical**: "I don't have recent readings from motor 12 (disconnected for more than 5 minutes)."
  or "For last week's behavior I recommend checking the Grafana dashboard."
