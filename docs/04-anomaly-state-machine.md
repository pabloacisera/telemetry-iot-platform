# State Machine — Anomalies, Motor, and Sensor

This is the most important business logic in the system. Read it alongside `03-mqtt-contract.md` and
`05-thresholds-sources.md`.

## Fixed parameters
- Reading interval: 15 seconds.
- **Consecutive readings threshold**: configurable per motor (`alarmConsecutiveReadings`, default 5).
  When a single sensor sustains anomalous readings for N consecutive readings, the motor enters ALARM.
- **Grace period**: configurable per motor (`alarmGracePeriodMs`, default 120000ms / 2 minutes).
  After ALARM is triggered, the operator has this window to intervene before the system trips.
- "Warning" zone: value between `warning_max` and `critical_max` (counts as anomalous).
- "Critical" zone: value > `critical_max` — a single reading triggers **immediate trip** (no grace timer).
- Default `critical_max` values: vibration >4.5 mm/s, temperature >90°C, current >1.3× rated.
- Sensor restart: 5 seconds. Motor restart: 100 seconds (see rationale in `03-mqtt-contract.md`).
- Reconnection grace window: 20s WiFi / 5s LAN.
- Sensor "stuck": same value rounded to 1 decimal for 20 consecutive readings (5 minutes).
- Automatic restart attempts per episode: 1 (if recurs → `disabled`). Upon manual reactivation,
  the counter resets to zero.

## Motor states
```
healthy → alarm (N consecutive anomalous readings on any sensor)
alarm   → shutting_down (grace timer expires without resolution)
alarm   → healthy (operator resolves OR all sensors normalize)
healthy → shutting_down (critical reading = immediate trip)
shutting_down → restarting (command sent to motor)
restarting → healthy (motor comes back online)
shutting_down/restarting → disabled (trip after previous auto-restart)
healthy/under_review → manual_shutdown (explicit operator/admin action)
```

## Sensor states (independent from motor)
```
ok → fault (out_of_range | stuck | disconnected) → restarting (auto, 5s) → ok
fault → fault_persistent (if recurs after auto-restart) → requires manual reactivation
```

## Motor transition rules

### 1. Consecutive anomaly → ALARM
Each sensor maintains an independent consecutive anomalous counter. When a reading falls in the
warning zone (`warning_max` < value ≤ `critical_max`), the counter increments. When a normal
reading arrives, the counter resets to 0. If the counter reaches `alarmConsecutiveReadings` (N),
the motor transitions from `healthy` → `alarm` and a `motor_alarm` alert is created.

### 2. Grace timer → TRIP
When ALARM is triggered, a grace timer starts (`alarmGracePeriodMs`). If the operator does not
resolve the alarm and readings remain anomalous, the timer expires and the system executes a
forced trip: `alarm` → `shutting_down` + MQTT restart command + `motor_trip` alert.

### 3. Critical reading → IMMEDIATE TRIP
A single reading in the critical zone (value > `critical_max`) triggers an immediate trip
without waiting for the grace timer. The motor transitions directly from `healthy` or `alarm`
to `shutting_down`.

### 4. Counter reset on normal reading
When a normal reading arrives, that sensor's consecutive counter resets to 0. If the motor is
in `alarm` and ALL sensor counters are 0, the motor auto-recovers: `alarm` → `healthy`.

### 5. Ring buffer reset on restart
Upon entering `restarting`, all consecutive counters of ALL sensors are cleared.
Evaluation starts from zero when the motor resumes publishing telemetry.

### 6. Auto-restart → disabled after recurrence
If after auto-restart the motor trips again, it transitions to `disabled` instead of restarting
a second time. Only 1 automatic attempt per episode; upon manual reactivation, the counter
resets to zero.

### 7. Operator resolves alarm
The operator can manually resolve an ALARM (via API). This cancels the grace timer and
transitions the motor back to `healthy`, resetting all sensor counters.

### 8. Alert resolution
If an operator marks an alert `resolved_at` but readings continue bad → a NEW alert is opened
(never reuses the resolved one, so history reflects that the resolution didn't work).

## Per-motor configuration

The alarm parameters are stored in the `motors` table and hot-reloadable:

| Field | Type | Default | Description |
|---|---|---|---|
| `alarmConsecutiveReadings` | INT | 5 | Number of consecutive anomalous readings to trigger ALARM |
| `alarmGracePeriodMs` | INT | 120000 | Grace period in ms before automatic trip |

These can be updated via `PATCH /config/motors/:id` and take effect immediately (hot-reload).

## Sensor transition rules — SEPARATE from motor rules
1. Reading outside `plausible_min/max` → `fault: out_of_range`.
2. Same value (rounded to 1 decimal) for 20 consecutive readings → `fault: stuck`.
3. No reconnection within the grace window → `fault: disconnected`.
4. Readings from a sensor in `fault` NEVER participate in motor health evaluation.
5. A sensor in `fault` is auto-restarted in 5s (targeted command, does not affect the motor or other sensors).
6. If it recurs in fault after its own auto-restart → `fault_persistent`, requires manual intervention
   (replacement/recalibration, not a simple restart).
7. While `motor.status` is `shutting_down`/`restarting`, ALL fault evaluation of its sensors is PAUSED
   (absence of data during intentional shutdown is not a real disconnection).

## Why the operator can distinguish "motor fault" from "sensor fault"
In the motor detail view, each of the 3 charts has its OWN status badge (`ok`/`fault`), independent of the
motor's general badge. If the vibration badge says `fault: stuck` but temperature and current are `ok` and
the motor is still `healthy`, the operator knows it's a sensor problem, not a motor problem. The RAG module
reinforces this in natural language (see `08-rag-flow.md`).
