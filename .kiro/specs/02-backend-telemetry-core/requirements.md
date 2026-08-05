# Spec 02 — Backend Telemetry Core (NestJS)

## Requirements (EARS)
- WHEN the backend receives a message on `plant/motor/{id}/telemetry`, THE SYSTEM SHALL validate it against
  `TelemetryEventDto` before persisting or evaluating it.
- WHEN a valid message arrives and the corresponding motor/sensor is NOT in `fault`, THE SYSTEM SHALL
  evaluate it against the thresholds in `motor_sensors` and update the per-sensor consecutive anomalous counter.
- IF a reading falls in the critical zone (value > `critical_max` of the corresponding `motor_sensor`),
  THEN THE SYSTEM SHALL trigger immediate trip (`shutting_down`) without waiting for the grace timer.
- IF a single sensor sustains anomalous readings (`warning_max` < value ≤ `critical_max`) for N
  consecutive readings (`alarmConsecutiveReadings`, configurable per motor), THEN THE SYSTEM SHALL
  transition the motor to `alarm` and create a record in `alerts` type `motor_alarm`.
- WHEN the motor enters `alarm`, THE SYSTEM SHALL start a grace timer (`alarmGracePeriodMs`, configurable
  per motor). If the timer expires without operator action, THE SYSTEM SHALL publish the forced restart
  command (`CommandModule`) and record `alerts` type `motor_trip`.
- WHEN the motor enters `restarting`, THE SYSTEM SHALL clear all consecutive anomalous counters of
  ALL its sensors. Evaluation starts from zero when the motor resumes publishing telemetry.
- IF after the automatic restart the motor trips again, THEN THE SYSTEM SHALL transition the motor
  to `disabled` and require manual reactivation (admin/operator). Only 1 automatic attempt per
  episode; upon manual reactivation, the counter resets to zero.
- WHEN a normal reading arrives, THE SYSTEM SHALL reset that sensor's consecutive counter to 0.
  If the motor is in `alarm` and ALL sensor counters are 0, THE SYSTEM SHALL auto-recover: `alarm` → `healthy`.
- WHEN an operator resolves an alarm, THE SYSTEM SHALL cancel the grace timer and transition the motor
  back to `healthy`, resetting all sensor counters.
- WHEN an alert is marked `resolved_at` but readings continue accumulating anomalies, THE SYSTEM SHALL open
  a NEW alert instead of reusing the resolved one.
- WHEN two users attempt to resolve the same alert concurrently, THE SYSTEM SHALL use optimistic locking
  (`UPDATE ... WHERE resolved_at IS NULL`) and respond 409 Conflict to the second user.
- WHEN a sensor receives the same value (rounded to 1 decimal) for 20 consecutive readings,
  THE SYSTEM SHALL mark it `fault: stuck` and exclude its readings from motor evaluation.
- WHEN a sensor reading is outside its physically possible range (`sensor_standards.plausible_max/min`),
  THE SYSTEM SHALL mark it `fault: out_of_range`.
- IF the LWT marks a motor `offline` and it doesn't reconnect within the grace window (20s wifi / 5s lan),
  THEN THE SYSTEM SHALL mark its sensors `fault: disconnected`.
- WHILE `motors.status` is `shutting_down` or `restarting`, THE SYSTEM SHALL pause all fault evaluation of its sensors.
- WHEN a valid reading is persisted, THE SYSTEM SHALL emit it via WebSocket to the corresponding `motor_id`
  room within 500ms, and update the Redis snapshot.
- THE SYSTEM SHALL store `alarmConsecutiveReadings` and `alarmGracePeriodMs` per motor in the `motors`
  table and hot-reload them into the evaluation engine when updated.

## Acceptance criteria
- No status change occurs without being recorded in `motor_status_history` or `sensor_faults`.
- The threshold evaluation module has test coverage for each of the edge cases documented in
  `kiro/steering/05-testing.md`.
