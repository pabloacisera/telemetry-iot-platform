# Spec 02 — Design

## Modules involved
`TelemetryModule` (consumer + evaluation + persistence), `CommandModule` (publishes restart), `AlertsModule`
(alerts + sensor_faults), `RealtimeGateway` (WS emission), `CacheModule` (Redis snapshot).

## Key services
- `TelemetryConsumerService`: MQTT subscriber (`plant/motor/+/telemetry`, `plant/motor/+/status`), validates DTO,
  delegates to `TelemetryEvaluationService`.
- `TelemetryEvaluationService`: orchestrates motor and sensor evaluation. Delegates to:
  - `MotorEvaluationService`: industrial alarm/trip model with consecutive counters and grace timers.
  - `SensorEvaluationService`: independent sensor fault detection (out_of_range, stuck, disconnected).
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

## Motor evaluation: consecutive readings + grace timer

### Per-sensor consecutive counter
Each `motor_sensor_id` has an in-memory counter (`consecutiveCounters`). When a reading falls in the
warning zone (`warning_max` < value ≤ `critical_max`), the counter increments. When a normal reading
arrives, the counter resets to 0.

### Alarm trigger
When a sensor's counter reaches `alarmConsecutiveReadings` (configurable per motor, default 5),
the motor transitions from `healthy` → `alarm` and a `motor_alarm` alert is created.

### Grace timer
On ALARM, a setTimeout-based grace timer starts (`alarmGracePeriodMs`, configurable, default 120s).
If not cancelled by operator or auto-recovery, it triggers a forced trip.

### Immediate trip
A critical reading (value > `critical_max`) bypasses the counter and grace timer, triggering
immediate `shutting_down` + MQTT restart command.

### Auto-recovery
When the motor is in `alarm` and ALL sensor counters reach 0 (readings normalized), the motor
auto-recovers: `alarm` → `healthy`.

### Configuration
`alarmConsecutiveReadings` and `alarmGracePeriodMs` are stored in the `motors` table and
hot-reloadable via `updateMotorParams()` without restarting the service.

## Sensor evaluation (independent)
- `out_of_range`: reading outside `plausible_min/max`.
- `stuck`: same value (rounded 1 decimal) for 20 consecutive readings.
- `disconnected`: no data within grace window (20s WiFi / 5s LAN).
- Auto-restart in 5s; if recurs → `fault_persistent`.

## Automatic restart counter
An `auto_restart_used` flag is maintained per motor in Redis. If it was already auto-restarted in
this episode and recurs → `disabled`. Upon manual reactivation (`PATCH /motors/:id/reactivate`),
the flag is cleared.
