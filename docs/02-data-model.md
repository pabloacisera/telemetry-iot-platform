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
  status ENUM('healthy','under_review','shutting_down','restarting','disabled','manual_shutdown') DEFAULT 'healthy',
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
  status ENUM('ok','restarting','fault','fault_persistent') DEFAULT 'ok',
  status_changed_at DATETIME,
  last_value DECIMAL(8,2),
  last_reading_at DATETIME,
  UNIQUE (motor_id, sensor_type)
);

-- Raw readings, partitioned by day, short retention (3 days)
CREATE TABLE readings (
  id BIGINT AUTO_INCREMENT,
  motor_sensor_id INT NOT NULL,
  value DECIMAL(8,2) NOT NULL,
  is_anomalous BOOLEAN DEFAULT FALSE,
  is_implausible BOOLEAN DEFAULT FALSE,
  recorded_at DATETIME NOT NULL,
  PRIMARY KEY (id, recorded_at),
  INDEX (motor_sensor_id, recorded_at)
) PARTITION BY RANGE (TO_DAYS(recorded_at)) (
  -- one partition per day, see creation mechanism in the daily job below
  PARTITION p_20260801 VALUES LESS THAN (TO_DAYS('2026-08-02'))
);

-- Hourly aggregate, long retention, fed by the daily job
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

-- Daily retention job log (repeated failure detection)
CREATE TABLE retention_job_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_at DATETIME NOT NULL,
  status ENUM('success','failure') NOT NULL,
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

**Core idea: `readings_hourly_agg` is ONE table that exists from day 1 (created once in the initial
migration). What runs every day is a JOB that INSERTS new rows into it, not one that recreates it.**

### What the daily job does (e.g. runs at 00:10 every day), in this exact order:

1. **Create tomorrow's partition** in `readings` (`ALTER TABLE readings ADD PARTITION (...)`). This is
   mandatory: MySQL with `PARTITION BY RANGE` needs the next day's partition to exist BEFORE inserts for
   that day arrive, or those inserts fail.
2. **Aggregate** data from ALL partitions older than 3 days that have NOT been aggregated yet (idempotent
   catch-up: if the job failed yesterday, today it processes both yesterday's and today's). For each
   `motor_sensor_id`, calculate avg/min/max/anomaly count/fault count per hour, and **insert** them into
   `readings_hourly_agg` (which already exists, only receives new rows).
3. **Verify** that the number of aggregated rows makes sense (e.g. ~24 rows per sensor per day) before continuing.
4. Only if step 3 was successful, **drop** the already-aggregated partitions
   (`ALTER TABLE readings DROP PARTITION ...`).
5. **Log** the result to `retention_job_log(run_at, status, error)`.
6. **If `retention_job_log` shows 2 consecutive failures**, generate a `system_job_failure` alert
   so the admin is notified.

### The 2 bugs to avoid (documented on purpose, because they're easy mistakes to make)
- **Bug 1**: forgetting step 1 (create tomorrow's partition) — next day's inserts fail silently or throw
  errors depending on config. The job ALWAYS creates the future partition before touching anything else.
- **Bug 2**: aggregate and drop without verifying in between — if the job crashes between "aggregate" and
  "drop", that's fine (worst case: re-aggregated next day, the insert must be idempotent with
  `INSERT ... ON DUPLICATE KEY UPDATE`). But if it drops BEFORE confirming aggregation succeeded, that day's
  history is lost forever. The order aggregate→verify→drop is non-negotiable.

### Result
- `readings` never grows indefinitely (always has ~3-4 days of raw data).
- `readings_hourly_agg` grows slowly and predictably: 45 sensors × 24 rows/day ≈ 1080 rows/day, not heavy.
- Grafana queries the aggregate for long history, and the raw table for recent detail (last 3 days).
