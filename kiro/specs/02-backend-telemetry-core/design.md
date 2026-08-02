# Spec 02 — Design

## Modules involved
`TelemetryModule` (consumer + evaluation + persistence), `CommandModule` (publishes restart), `AlertsModule`
(alerts + sensor_faults), `RealtimeGateway` (WS emission), `CacheModule` (Redis snapshot).

## Key services
- `TelemetryConsumerService`: MQTT subscriber (`plant/motor/+/telemetry`, `plant/motor/+/status`), validates DTO,
  delegates to `TelemetryEvaluationService`.
- `TelemetryEvaluationService`: complete state machine (motor and sensor), sliding window of 8 readings
  per `motor_sensor_id` (maintained in memory + backed by `readings` query on boot).
- `TelemetryRepository`: persistence to `readings` (current day's partition).
- `StatusTransitionService`: applies and audits status changes in `motors`/`motor_sensors` + history.

## DTOs
```ts
class TelemetryEventDto {
  @IsInt() motor_id: number;
  @IsISO8601() timestamp: string;
  @IsNumber() temperature_c: number;
  @IsNumber() vibration_mm_s: number;
  @IsNumber() current_a: number;
}
```

## Sliding window schema
In-memory structure per `motor_sensor_id`: circular queue of 8 booleans (anomalous or not?). When a new
reading arrives, it's pushed and the oldest is discarded; the count of `true` values decides the transition.

### Evaluation zones per reading:
- `value ≤ healthy_max` → healthy, does not count as anomalous.
- `healthy_max < value ≤ warning_max` → precaution zone, does not count (operating margin).
- `warning_max < value ≤ critical_max` → warning zone, counts as anomalous in the window.
- `value > critical_max` → critical zone, immediate `under_review` trigger (no window wait).

### Ring buffer reset:
Upon entering `restarting`, the 8-reading window of ALL sensors of the motor is cleared.
When publishing resumes, evaluation starts from zero.

### Automatic restart counter:
An `auto_restart_used` flag is maintained per motor. If it was already auto-restarted in this episode and
recurs → `disabled`. Upon manual reactivation (`PATCH /motors/:id/reactivate`), the flag is cleared.
