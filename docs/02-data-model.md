# Data Model

## MySQL Tables

```sql
-- Motors
CREATE TABLE motors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,           -- e.g. "MTR-07"
  name VARCHAR(100) NOT NULL,
  location VARCHAR(100),
  rated_current_a DECIMAL(6,2) NOT NULL,
  insulation_class ENUM('B','F','H') DEFAULT 'F',
  connection_type ENUM('wifi','lan') NOT NULL,
  status ENUM('healthy','alarm','shutting_down','restarting','disabled','manual_shutdown') DEFAULT 'healthy',
  status_changed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Standards reference (seed, NOT editable from the app)
CREATE TABLE sensor_standards (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sensor_type ENUM('temperature','vibration','current') NOT NULL,
  standard_name VARCHAR(100) NOT NULL,        -- "ISO 10816-3 Class I", "NEMA MG-1 Class B"
  unit VARCHAR(10) NOT NULL,
  plausible_min DECIMAL(8,2) NOT NULL,
  plausible_max DECIMAL(8,2) NOT NULL,
  default_healthy_max DECIMAL(8,2) NOT NULL,
  default_warning_max DECIMAL(8,2) NOT NULL,
  default_critical_max DECIMAL(8,2) NOT NULL, -- value above which immediate action is triggered
  source_reference TEXT NOT NULL              -- URL/citation of where the number came from
);

-- Actual sensor instance per motor
CREATE TABLE motor_sensors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  motor_id INT NOT NULL REFERENCES motors(id),
  sensor_type ENUM('temperature','vibration','current') NOT NULL,
  healthy_max DECIMAL(8,2) NOT NULL,          -- editable by admin, validated against sensor_standards
  warning_max DECIMAL(8,2) NOT NULL,
  critical_max DECIMAL(8,2) NOT NULL,         -- value > critical_max → immediate action (no window wait)
  status ENUM('ok','fault','fault_persistent') DEFAULT 'ok',
  status_changed_at DATETIME,
  last_value DECIMAL(8,2),
  last_reading_at DATETIME,
  UNIQUE (motor_id, sensor_type)
);

-- Raw readings, short retention (default 7 days), purged hourly by the retention job.
-- Plain table (NO MySQL partitioning): the purge is an indexed DELETE by recorded_at.
CREATE TABLE readings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  motor_sensor_id INT NOT NULL,
  value DECIMAL(8,2) NOT NULL,
  is_anomalous BOOLEAN DEFAULT FALSE,
  is_implausible BOOLEAN DEFAULT FALSE,
  recorded_at DATETIME NOT NULL,
  INDEX (motor_sensor_id, recorded_at)
);

-- Hourly aggregate, long retention, fed by the hourly job
CREATE TABLE readings_hourly_agg (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  motor_sensor_id INT NOT NULL,
  hour_bucket DATETIME NOT NULL,
  avg_value DECIMAL(8,2),
  min_value DECIMAL(8,2),
  max_value DECIMAL(8,2),
  anomaly_count INT DEFAULT 0,
  fault_count INT DEFAULT 0,
  UNIQUE (motor_sensor_id, hour_bucket)
);

-- Motor-level alerts (do not confuse with sensor_faults)
-- type is free-form VARCHAR; actual values used by the evaluation pipeline:
--   motor_alarm, motor_trip, motor_disabled, sensor_fault
CREATE TABLE alerts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  motor_id INT NOT NULL REFERENCES motors(id),
  type VARCHAR(40) NOT NULL,
  metadata JSON,
  triggered_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  resolved_by INT NULL REFERENCES users(id),
  resolution_note TEXT,
  deleted_at DATETIME NULL
);

-- Sensor-level faults (separate from alerts)
CREATE TABLE sensor_faults (
  id INT PRIMARY KEY AUTO_INCREMENT,
  motor_sensor_id INT NOT NULL REFERENCES motor_sensors(id),
  fault_type ENUM('out_of_range','stuck','disconnected') NOT NULL,
  detected_at DATETIME NOT NULL,
  auto_restarted_at DATETIME NULL,
  resolved_at DATETIME NULL,
  status ENUM('active','auto_restarted','persistent_manual') DEFAULT 'active'
);

-- Audit of every motor status change
CREATE TABLE motor_status_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  motor_id INT NOT NULL REFERENCES motors(id),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  changed_at DATETIME NOT NULL,
  changed_by INT NULL REFERENCES users(id)   -- NULL = system decision
);

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','operator','viewer') NOT NULL
);

CREATE TABLE refresh_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked BOOLEAN DEFAULT FALSE
);

-- System-wide configuration (singleton key-value)
CREATE TABLE system_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  `key` VARCHAR(50) UNIQUE NOT NULL,
  value JSON NOT NULL
);

-- Per-motor override of global alert parameters
CREATE TABLE motor_alert_overrides (
  id INT PRIMARY KEY AUTO_INCREMENT,
  motor_id INT UNIQUE NOT NULL REFERENCES motors(id),
  alarm_consecutive_readings INT NOT NULL,
  alarm_grace_period_ms INT NOT NULL,
  post_restart_cooldown_ms INT NOT NULL,
  max_auto_restarts INT NOT NULL
);

-- Retention job log (runs hourly). Column names are legacy; semantics now:
--   partitions_aggregated = rows aggregated, partitions_dropped = rows deleted.
CREATE TABLE retention_job_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_at DATETIME NOT NULL,
  status VARCHAR(10) NOT NULL,               -- 'ok' | 'error'
  partitions_created INT DEFAULT 0,
  partitions_aggregated INT DEFAULT 0,
  partitions_dropped INT DEFAULT 0,
  error TEXT NULL
);
```

## MongoDB Collection
```
embeddings { _id, chunk_text, vector: number[384], topic, source_reference, created_at }
```
Single collection. Contains maintenance knowledge fragments (not telemetry, not historical data).
384-dimension vector generated by `all-MiniLM-L6-v2` via `@xenova/transformers`.

## Redis
One hash per sensor: key `motor_sensor:{id}:last` → `{value, status, recorded_at}`. Written in the same
flow as MySQL persistence (write-through), read on the dashboard's initial snapshot (`GET /motors`).

---

## The retention mechanism — explained step by step

**Core idea: `readings_hourly_agg` is ONE table that exists from day 1. A job runs every hour and
(a) inserts new aggregate rows into it and (b) deletes raw readings past the retention window.
There is NO MySQL partitioning — the purge is a plain indexed `DELETE`.**

### What the hourly job does (cron `5 * * * *`, i.e. minute :05 of every hour), in this order:

1. **Aggregate the previous full hour** (`13:00–13:59` when it runs at `14:05`): for each
   `motor_sensor_id`, compute avg/min/max and count anomalies/faults, then **upsert** into
   `readings_hourly_agg` (idempotent on the unique key `(motor_sensor_id, hour_bucket)`).
2. **Purge raw readings** older than `RETENTION_DAYS` (default **7 days**) with a single
   `DELETE FROM readings WHERE recorded_at < cutoff`.
3. **Purge resolved alerts** older than `ALERT_RETENTION_DAYS` (default **30 days**).
4. **Log** the run to `retention_job_log(run_at, status, partitions_aggregated, partitions_dropped, error)`
   (the `partitions_*` column names are legacy; today they carry "rows aggregated" / "rows deleted").

A **second cron at minute :20** (`20 * * * *`) runs a safety-net sweep: any alert still open after 24h
is auto-resolved and an `alert-resolved` event is emitted.

### Result
- `readings` never grows indefinitely (keeps ~`RETENTION_DAYS` of raw data; default 7 days).
- `readings_hourly_agg` grows slowly and predictably: 45 sensors × 24 rows/day ≈ 1080 rows/day.
- Grafana queries the aggregate for long history and the raw table for recent detail.
