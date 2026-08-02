# Spec 01 — Design

## Classes
- `Sensor`: type, healthy range, nominal value (if applicable), `fault_mode`, `generate_reading()`.
- `MotorSimulator`: motor_id, `connection_type`, 3 `Sensor` instances, own MQTT client (LWT configured),
  methods `power_on()`, `power_off()`, `generate_reading()`, `publish()`, incoming command handler.
- Orchestrator `main()`: creates the 15 instances from a config (`MOTORS_CONFIG`), async loop every 15s.

## Code reference
See the complete validated skeleton from the design conversation — transferred literally to
`simulator/motor_simulator.py`, expanding:
1. Handling of `connection_type` (wifi/lan) with different reconnection probability/duration.
2. Additional subscription to `qa/motor/{id}/inject-fault` with its own QA credentials client
   (separate from the ESP32's main client, to keep the ACL clean).
3. `shutting_down`→`restarting` phases for motor restart (100s), publishing intermediate state via
   `plant/motor/{id}/restart-progress` (`{"motor_id":7,"phase":"restarting","seconds_remaining":87}`).

## Configuration schema (`motors_config.json` or env)
```json
{ "motor_id": 7, "rated_current_a": 12.0, "connection_type": "wifi",
  "mqtt_user": "esp32_motor7", "mqtt_pass": "..." }
```
