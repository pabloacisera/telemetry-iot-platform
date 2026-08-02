# MQTT Simulator — Developer Guide

## What is this and why is it the first piece built

The simulator is a Python application that emulates 15 ESP32 microcontrollers, each representing one
industrial motor with 3 sensors (temperature, vibration, current). It is the **data source** of the entire
system — without it, there is nothing to process, evaluate, persist, or display.

It is built first because:
- It validates the MQTT contract (`docs/03-mqtt-contract.md`) in isolation, before the backend exists.
- It provides realistic traffic for testing every downstream component.
- It exercises the full Mosquitto ACL configuration (one user per device, contained blast radius).
- It models real-world behaviors: noise, anomalies, faults, disconnections, restart timings.

## How it works (high level)

```
main() → creates 15 MotorSimulator instances (one per motor from config)
       → async loop: every 15 seconds, each instance generates and publishes telemetry
       → each instance also listens for commands (stop, restart, restart_sensor)
       → a separate QA subscription allows injecting faults on demand
```

## Key behaviors modeled

| Behavior | What happens | Timing |
|---|---|---|
| Normal telemetry | Publishes 3 sensor values every 15s with realistic noise | Continuous |
| Anomaly (3% chance) | Value multiplied by 1.3–1.8x (real anomaly, not a sensor fault) | Random |
| Sensor fault: stuck | Same value repeated (injected via QA) | Until cleared |
| Sensor fault: out_of_range | Physically impossible value (injected via QA) | Until cleared |
| Sensor fault: disconnected | Stops publishing for that sensor (injected via QA) | Until cleared |
| Motor stop command | Stops publishing telemetry, sends ack | Immediate |
| Motor restart command | Stop → 100s real wait (anti-short-cycle) → resume | 100 seconds |
| Sensor restart command | Clears fault_mode for that sensor | 5 seconds |
| WiFi reconnection | Random 0–15s reconnect delay after simulated disconnect | 0–15s |
| LAN reconnection | Longer/rarer disconnections (models physical failure) | >5s |
| Restart progress | Publishes countdown every second during motor restart | 100 messages |
| LWT (Last Will) | Broker publishes "offline" if ESP32 drops without clean disconnect | Automatic |

## Configuration

Each motor is defined in a config file or environment with:
```json
{
  "motor_id": 7,
  "rated_current_a": 12.0,
  "connection_type": "wifi",
  "mqtt_user": "esp32_motor7",
  "mqtt_pass": "<from .env>"
}
```

The 15 motors are split between `wifi` and `lan` connection types for realism.

## How to run (once built)

```bash
# Standalone (development)
cd simulator/
pip install -r requirements.txt
python main.py

# Via Docker Compose (production)
docker compose up simulator-python
```

## How it interacts with the rest of the system

- **Mosquitto**: authenticates with per-device credentials, publishes to its own topics only (ACL enforced).
- **Backend**: the backend subscribes to `plant/motor/+/telemetry` and `plant/motor/+/status` — it receives
  what the simulator publishes, but they never communicate directly.
- **QA script**: a separate script (`scripts/inject_fault.py`) publishes to `qa/motor/{id}/inject-fault`
  with its own credentials. The simulator subscribes to this topic to activate fault modes.

## What this does NOT do

- Does not talk to the REST API (no JWT, no HTTP).
- Does not access MySQL, Redis, or Mongo.
- Does not make decisions about motor health — that's the backend's job.
- Does not expose any UI or API.
