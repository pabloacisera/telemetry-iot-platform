# Spec 02 — Tasks

1. Migrations: `motors` (with `alarmConsecutiveReadings`, `alarmGracePeriodMs`), `sensor_standards` (seed), `motor_sensors`, `readings` (partitioned), `alerts`, `sensor_faults`, `motor_status_history`.
2. DTOs + validation (`TelemetryEventDto`, `UpdateMotorDto` with alarm params).
3. `TelemetryConsumerService` (backend MQTT connection, broad ACL).
4. `MotorEvaluationService` with consecutive counter model, grace timer, immediate trip, auto-recovery.
5. `SensorEvaluationService` with independent fault detection (out_of_range, stuck, disconnected).
6. `StatusTransitionService` + audit in `motor_status_history`.
7. Integration with `CommandModule` to publish automatic forced restart.
8. Integration with `RealtimeGateway` (emission per room `motor:{id}`).
9. Integration with `CacheModule` (Redis snapshot updated on each reading).
10. Hot-reload: `updateMotorParams()` for alarm config, `updateSensorThresholds()` for thresholds.
11. Unit tests for each edge case (reference `kiro/steering/05-testing.md`).
12. REST endpoint for initial snapshot (`GET /motors` and `GET /motors/:id`) for grid and detail.
