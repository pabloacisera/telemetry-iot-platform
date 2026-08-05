# Spec 01 — MQTT Simulator (15 Virtual ESP32)

## Context
15 motors, each with its own simulated ESP32 (temperature, vibration, current). See `docs/03-mqtt-contract.md`
for the complete topic and payload contract.

## Requirements (EARS)

- WHEN the simulator starts, THE SYSTEM SHALL create 15 `MotorSimulator` instances, each with its own
  authenticated MQTT connection (own username/password) and its own configured Last Will and Testament.
- WHEN an instance connects successfully, THE SYSTEM SHALL publish `{"state":"online"}` (retained) on
  `plant/motor/{id}/status`.
- WHILE a motor is powered on, THE SYSTEM SHALL publish every 15 seconds a telemetry message with the
  3 sensor values on `plant/motor/{id}/telemetry`, QoS 1.
- IF the generated value of a sensor exceeds its healthy range with low probability (3%), THEN the simulator
  SHALL generate a real anomaly (not a sensor fault) by multiplying the base value by 1.3–1.8x.
- WHEN the backend publishes a command on `plant/motor/{id}/cmd` with `action: "stop"`, THE SYSTEM SHALL
  power off the motor (stop publishing telemetry) and respond with `ack`.
- WHEN the backend publishes `action: "restart"`, THE SYSTEM SHALL power off the motor, wait 100 real
  seconds (anti-short-cycle), and power it back on, publishing `ack` upon completing each phase as appropriate.
- WHEN the backend publishes a command on `plant/motor/{id}/sensor/{type}/cmd` with `action: "restart_sensor"`,
  THE SYSTEM SHALL clear that sensor's `fault_mode` in 5 seconds, without affecting the motor or other sensors.
- WHEN the QA script publishes on `qa/motor/{id}/inject-fault`, THE SYSTEM SHALL activate the corresponding
  `fault_mode` (`stuck`, `out_of_range`, `disconnected`) on the indicated sensor.
- IF the motor's `connection_type` is `wifi`, THEN a simulated disconnection SHALL reconnect automatically
  within a random window of 0–15s (to validate the backend's 20s grace window).
- IF the `connection_type` is `lan`, THEN a simulated disconnection SHALL be more stable and, if it occurs,
  take longer to reconnect (to validate the 5s grace window, which assumes a LAN drop is more serious).

## Acceptance criteria
- All 15 instances run in parallel without blocking each other (asyncio, not blocking threads).
- No message is lost due to broker disconnection thanks to QoS 1 + `clean_session=False`.
- Fault injection is never reachable from the frontend or the "production" backend.
