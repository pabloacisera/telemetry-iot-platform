# Spec 06 — Grafana Observability

## Requirements (EARS)
- WHEN Grafana initializes, THE SYSTEM SHALL automatically provision the MySQL datasource via a
  provisioning file (no manual UI configuration).
- THE SYSTEM SHALL provision versioned dashboards in the repo: historical per sensor/motor (using
  `readings_hourly_agg`, not the raw table) and an alert panel by severity/motor.
- Grafana queries ONLY MySQL; it does not have or need a connection to Mongo/Redis.
