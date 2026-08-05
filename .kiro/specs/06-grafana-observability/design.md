# Spec 06 — Design
`provisioning/datasources/mysql.yml`, `provisioning/dashboards/telemetry.json`. Historical panels query
`readings_hourly_agg` (lightweight); a "recent detail" panel can query `readings` (raw, only last 3 days
due to retention).
