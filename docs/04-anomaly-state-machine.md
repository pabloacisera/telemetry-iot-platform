# State Machine — Anomalies, Motor, and Sensor

This is the most important business logic in the system. Read it alongside `03-mqtt-contract.md` and
`05-thresholds-sources.md`.

## Fixed parameters
- Reading interval: 15 seconds.
- Evaluation window: last 8 readings (≈ 2 minutes).
- Count threshold for "warning" zone alert: 5 out of 8 anomalous readings.
- "Warning" zone: value between `warning_max` and `critical_max`.
- "Critical" zone: value > `critical_max` — a single reading triggers immediately (does not wait for window).
- Default `critical_max` values: vibration >4.5 mm/s, temperature >90°C, current >1.3× rated.
- Sensor restart: 5 seconds. Motor restart: 100 seconds (see rationale in `03-mqtt-contract.md`).
- Reconnection grace window: 20s WiFi / 5s LAN.
- Sensor "stuck": same value rounded to 1 decimal for 20 consecutive readings (5 minutes).
- Automatic restart attempts per episode: 1 (if recurs → `disabled`). Upon manual reactivation,
  the counter resets to zero.

## Motor states
```
healthy → under_review → shutting_down → restarting → healthy (or straight to under_review if still bad)
                                                    → disabled (if recurs after auto-restart)
healthy/under_review → manual_shutdown (explicit operator/admin action)
```

## Sensor states (independent from motor)
```
ok → fault (out_of_range | stuck | disconnected) → restarting (auto, 5s) → ok
fault → fault_persistent (if recurs after auto-restart) → requires manual reactivation
```

## Motor transition rules
1. Critical reading (value > `critical_max`) → immediate `under_review` + `alerts(type=warning)`.
2. 5/8 readings in warning zone (`warning_max` < value ≤ `critical_max`) → `under_review` + `alerts(type=warning)`.
3. If 2 more minutes pass without operator action and still anomalous → `shutting_down` → `restarting` (100s)
   → publishes MQTT restart command → `alerts(type=forced_restart)`.
4. **Ring buffer reset**: upon entering `restarting`, the 8-reading window of ALL its sensors is cleared.
   Evaluation starts from zero when the motor resumes publishing telemetry.
5. If after auto-restart it accumulates 5/8 anomalous again → `disabled` + `alerts(type=disabled)`,
   requires manual reactivation (admin/operator). Only 1 automatic attempt per episode.
6. Upon manually reactivating a `disabled` motor, the automatic attempt counter resets to zero —
   it's not a permanent ban.
7. If an operator marks an alert `resolved_at` but readings continue bad → a NEW alert is opened
   (never reuses the resolved one, so history reflects that the resolution didn't work).
8. **Widespread sensor failure**: if all 3 sensors of a motor are in `fault`/`fault_persistent`
   simultaneously, the motor transitions to `under_review` with `alerts(type=sensor_failure_widespread)` —
   a motor that cannot be observed also needs review.

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
