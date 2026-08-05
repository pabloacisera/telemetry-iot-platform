# Spec 01 — Tasks

1. Setup Mosquitto: `mosquitto.conf` with `allow_anonymous false`, `password_file`, `acl_file` (15 ESP32 + backend + qa).
2. Implement `Sensor` class with 3 fault_modes and noise/anomaly at 3%.
3. Implement `MotorSimulator` class with LWT, power_on/power_off/generate_reading/publish.
4. Implement command handlers: full motor (stop/restart with 100s) and individual sensor (restart_sensor, 5s).
5. Implement `restart-progress` auxiliary topic with real countdown.
6. Implement separate QA client subscribed to `inject-fault`.
7. Implement wifi/lan differentiation in simulated reconnection.
8. Orchestrator with 15 instances from config.
9. Dockerfile for simulator + entry in `docker-compose.yml`.
10. Tests: verify that a sensor fault does not affect other sensors on the same motor; verify that during
    `shutting_down`/`restarting` no telemetry is published.
