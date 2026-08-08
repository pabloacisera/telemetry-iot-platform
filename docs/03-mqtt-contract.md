# MQTT Contract

## Simulated physical topology
15 ESP32 (one per motor), each with 3 locally connected sensors (temperature I2C/1-Wire, vibration I2C
accelerometer, current clamp/shunt sensor). Each ESP32 can be connected via **WiFi** (native) or
**Ethernet/LAN** (external module like W5500) — modeled with the `connection_type` attribute per motor,
split between both for realism.

## Topics

| Topic | Direction | QoS | Retain | Purpose |
|---|---|---|---|---|
| `plant/motor/{motor_id}/telemetry` | ESP32 → backend | 1 | no | Combined reading from all 3 sensors |
| `plant/motor/{motor_id}/status` | ESP32 → backend (via LWT) | 1 | yes | `online`/`offline`, physical connection |
| `plant/motor/{motor_id}/restart-progress` | ESP32 → backend | 0 | no | Countdown during restart (100s) |
| `plant/motor/{motor_id}/cmd` | backend → ESP32 | 1 | no | Command for the entire motor |
| `plant/motor/{motor_id}/cmd/ack` | ESP32 → backend | 1 | no | Motor command acknowledgment |
| `plant/motor/{motor_id}/sensor/{type}/cmd` | backend → ESP32 | 1 | no | Command for a specific sensor |
| `plant/motor/{motor_id}/sensor/{type}/cmd/ack` | ESP32 → backend | 1 | no | Sensor command acknowledgment |
| `system/simulator/motor-added` | backend → simulator | 1 | yes | Hot-reload: notify simulator to start a new motor instance |
| `system/simulator/motor-removed` | backend → simulator | 1 | yes | Hot-reload: notify simulator to stop a motor instance |
| `qa/motor/{motor_id}/inject-fault` | QA script → simulator | 1 | no | Internal tool only, never from the app |

## Payloads

**Telemetry:**
```json
{ "motor_id": 7, "timestamp": "2026-08-01T14:32:10Z",
  "temperature_c": 68.4, "vibration_mm_s": 1.65, "current_a": 12.1 }
```

**Status (LWT, retained):**
```json
{ "motor_id": 7, "state": "online", "since": "2026-08-01T14:30:00Z" }
```
If the ESP32 drops without warning, the broker automatically replaces this retained message with `state: "offline"`.

**Restart progress:**
```json
{ "motor_id": 7, "phase": "restarting", "seconds_remaining": 87 }
```

**Motor command:**
```json
{ "action": "stop" | "restart", "requested_by": "system" | "user:42", "reason": "forced_restart_anomaly", "request_id": "a1b2c3" }
```

**Ack:**
```json
{ "request_id": "a1b2c3", "status": "done", "timestamp": "2026-08-01T14:32:45Z" }
```

**Specific sensor command:**
```json
{ "action": "restart_sensor", "request_id": "d4e5f6" }
```

**Fault injection (QA only):**
```json
{ "sensor_type": "vibration", "fault_mode": "stuck" | "out_of_range" | "disconnected" }
```

**Hot-reload motor-added (backend → simulator):**
```json
{ "motorId": 16, "ratedCurrentA": 10.5, "connectionType": "wifi", "mqttUser": "esp32_motor16", "mqttPass": "..." }
```

**Hot-reload motor-removed (backend → simulator):**
```json
{ "motorId": 16 }
```

## ACL (Mosquitto) — one user per device, contained blast radius

```
user esp32_motor7
topic write plant/motor/7/telemetry
topic write plant/motor/7/status
topic write plant/motor/7/restart-progress
topic read  plant/motor/7/cmd
topic read  plant/motor/7/sensor/+/cmd
topic write plant/motor/7/cmd/ack
topic write plant/motor/7/sensor/+/cmd/ack
topic read  qa/motor/7/inject-fault

user backend_service
topic read  plant/motor/+/telemetry
topic read  plant/motor/+/status
topic read  plant/motor/+/restart-progress
topic write plant/motor/+/cmd
topic write plant/motor/+/sensor/+/cmd
topic read  plant/motor/+/cmd/ack
topic read  plant/motor/+/sensor/+/cmd/ack
topic write system/simulator/motor-added
topic write system/simulator/motor-removed

user qa_fault_injector
topic write qa/motor/+/inject-fault
```
One ACL per device means that if an ESP32 is compromised, the attacker can only affect ITS motor, not the
other 14. The broker does not use `allow_anonymous` on purpose, even though it's isolated in the Docker
internal network — it models the real plant topology (devices on WiFi/LAN, not on the same network as the
broker).

## Reconnection and tolerance by link type

### ESP32 (simulator)
A disconnection must NOT be interpreted as a fault immediately — it depends on the link type:

- **WiFi**: brief outages are normal (interference, roaming). Grace window: **20 seconds**. If it
  reconnects within that window, no `sensor_faults` are generated, only the event is logged.
- **LAN**: much more stable; an outage almost always indicates a real physical issue (cable, switch). Grace
  window: **5 seconds**, shorter because a LAN drop is more likely a real problem.
- If the motor is in `shutting_down`/`restarting`, NO disconnection from its sensors is evaluated (it's intentional).

### Backend (NestJS)
- MQTT client configured with `clean_session=false` + automatic reconnection (exponential backoff).
- While disconnected, Mosquitto retains pending QoS 1 messages (within the configured queue limit in
  `max_queued_messages`) and redelivers them upon reconnection.
- **Known limitation**: a very long gap (minutes) could exceed the broker queue and lose messages.
  For this project (15 motors × 1 msg/15s = ~1 msg/s total), Mosquitto's default queue (1000 msgs)
  handles ~15 minutes of disconnection without losing anything.

## Restart timings (real values, not compressed)

- **Individual sensor**: 5 seconds — real boot time of an ESP32-class microcontroller.
- **Full motor**: 100 seconds — real minimum of an *anti-short-cycle timer*, the protection mechanism that
  prevents re-energizing a motor immediately after shutting it down (avoids current spike and thermal stress
  on the winding). The real full range is 100s to several minutes depending on motor size; the floor is used
  because the simulated motors are small/medium, not high voltage.
- Status sequence during a forced restart: `shutting_down` (fast, network+ack time) → `restarting`
  (100s, with real countdown via `restart-progress`) → `healthy` or straight to `under_review` if the
  first new readings are already bad.
