# Grafana Observability — Developer Guide

## What is this and why is it the sixth piece built

Grafana is the historical visualization layer. While the React dashboard shows the **live now**
(real-time via WebSocket), Grafana shows **what happened over time** — trends, aggregated metrics,
and alert patterns. It's the tool an operator or maintenance engineer uses to investigate past behavior,
plan maintenance windows, and validate that interventions worked.

It is built sixth because:
- It needs MySQL populated with data (specs 01-02 must be running to generate readings and alerts).
- It queries `readings_hourly_agg` (the aggregated table), which is fed by the daily retention job in the backend.
- It does NOT depend on the frontend, auth, or RAG — it's a standalone read-only visualization tool.
- Being provisioned as code means it survives container recreation without manual reconfiguration.

## What problem it solves

The React dashboard answers "what's happening right now?" but cannot answer:
- "Was this motor trending towards failure over the past week?"
- "How many alerts did we have per motor this month?"
- "Did vibration levels decrease after the bearing was replaced?"

Grafana fills this gap with historical panels that query the aggregated data MySQL already stores.

## How it works (high level)

```
Grafana container boots
  → reads provisioning/datasources/mysql.yml → auto-configures MySQL connection
  → reads provisioning/dashboards/*.json → loads dashboards without manual import
  → dashboards query readings_hourly_agg and alerts tables directly via SQL
  → no connection to Redis, Mongo, or the NestJS backend
```

## Architecture decisions

| Decision | Rationale |
|---|---|
| Queries `readings_hourly_agg`, not `readings` | Raw readings are partitioned with 3-day retention. Hourly aggregates are lightweight and persist long-term. |
| One "recent detail" panel queries `readings` (last 3 days) | For short-term forensic analysis when the operator needs per-reading granularity. |
| MySQL datasource only | Grafana doesn't need Redis (live snapshot) or Mongo (RAG knowledge). It's a historical tool. |
| Provisioning as code | Dashboards and datasource are files in the repo. `docker compose down/up` doesn't lose config. |
| Port 3000 internal → 4002 host | Avoids collision with the NestJS backend (4001). Only accessible through Nginx. |
| Read-only MySQL user | Grafana connects with a dedicated MySQL user that only has SELECT on the relevant tables. |

## What it visualizes

### Dashboard 1: "Historical per Motor"
- **Panel A**: Average sensor values per hour (line chart, one series per sensor type).
- **Panel B**: Min/Max bands per sensor per hour (useful for detecting increasing variance).
- **Panel C**: Anomaly count per hour (bar chart — spikes indicate problem periods).
- **Templating variable**: motor selector (dropdown) to switch between the 15 motors.

### Dashboard 2: "Alerts by Severity"
- **Panel A**: Alert count grouped by type and motor (stacked bar, time series).
- **Panel B**: Active vs resolved alerts over time (for measuring response time).
- **Panel C**: Sensor faults by type (out_of_range, stuck, disconnected) per motor.

## File structure

```
grafana/
├── provisioning/
│   ├── datasources/
│   │   └── mysql.yml          # auto-configures the MySQL connection
│   └── dashboards/
│       ├── dashboard.yml      # tells Grafana where to find JSON files
│       ├── historical.json    # "Historical per Motor" dashboard
│       └── alerts.json        # "Alerts by Severity" dashboard
└── grafana.ini                # minimal config (disable login for internal-only access)
```

## Environment / Docker Compose integration

```yaml
dashboard-grafana:
  image: grafana/grafana:11.0.0
  ports:
    - "4002:3000"
  volumes:
    - ./grafana/provisioning:/etc/grafana/provisioning
    - ./grafana/grafana.ini:/etc/grafana/grafana.ini
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
  depends_on:
    db-mysql:
      condition: service_healthy
  networks:
    - telemetry-net
```

## How to verify (task 4)

```bash
docker compose down && docker compose up -d
# Wait for healthy
curl -s http://localhost:4002/api/health | jq .
# Check datasource exists
curl -s http://localhost:4002/api/datasources | jq '.[].name'
# Check dashboards exist
curl -s http://localhost:4002/api/search | jq '.[].title'
```

All three should return data without any manual UI interaction.

## What this does NOT do

- Does not show real-time data (that's the React dashboard via WebSocket).
- Does not connect to Redis or Mongo.
- Does not provide alerting rules (Grafana alerting is not used — the NestJS state machine handles alerting).
- Does not replace the RAG for natural language queries about plant state.
- Does not need NestJS authentication (it's behind Nginx on the internal network, not exposed to the internet directly).
