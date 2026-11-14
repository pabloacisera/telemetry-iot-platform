# What Was Intentionally Left Out, and How It Would Scale

These are points to answer confidently if an interviewer asks "what if this grew?" — they are not design
shortcomings, they are conscious scope decisions for a 10-day project.

- **Time series**: currently solved with partitioned MySQL + hourly aggregation (see `02-data-model.md`).
  At much larger scale (hundreds of motors, years of retention), the migration path would be TimescaleDB or
  InfluxDB, which automate compression and retention. The manual mechanism was documented precisely to explain
  why a specialized engine would help in that scenario.
- **Managed vector search**: currently the RAG's cosine similarity is computed in-process on Mongo Community
  (without Atlas). At higher document volume, a dedicated vector DB would be appropriate (Atlas Vector
  Search, Qdrant, pgvector).
- **gRPC / microservices**: not introduced because the backend is a modular monolith with no need for
  high-performance internal communication. If the RAG module grew and was separated into its own process
  (e.g. a dedicated Python service), then evaluating gRPC between backend and that service would make sense.
- **Device authentication**: the per-device ACL in Mosquitto already models the contained blast radius;
  at real plant scale, mutual TLS (per-device certificates) would be added instead of plain
  username/password.
- **High availability**: currently a single instance of each container. A natural next step would be
  MySQL with a read replica (Grafana querying the replica, not the primary) and the backend running in
  more than one replica behind a load balancer, with Redis as shared state between replicas (it already is,
  by design).
- **RAG throughput (Groq free-tier rate limit)**: the assistant is capped at ~2 queries/minute because
  `openai/gpt-oss-120b` allows 8,000 tokens/minute and each request spends ~4k tokens (mostly the system
  prompt). Under load it returns a fallback + logs a 429. The fix is a configuration/tuning change, not a
  bug: see **"Performance tuning — Groq free-tier rate limit"** in `docs/16-rag-guide.md`.
