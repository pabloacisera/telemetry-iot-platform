"""
MotorSimulator class — models a single ESP32 with 3 sensors and MQTT connectivity.

Responsibilities:
- Maintains its own MQTT connection with LWT configured.
- Publishes telemetry every 15 seconds (when powered on).
- Delegates command handling to command_handler module.
- Simulates WiFi/LAN reconnection behavior differences.

Command handling (stop, restart, sensor restart, fault injection) is in
command_handler.py to keep this file focused on connectivity and telemetry.
"""

import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from aiomqtt import Client, MqttError, Will

from simulator.sensor import Sensor, SensorType
from simulator.config import MotorConfig, SENSOR_DEFAULTS
from simulator.command_handler import (
    handle_motor_command,
    handle_sensor_command,
    handle_fault_injection,
    _publish_ack,
)

logger = logging.getLogger(__name__)


class MotorSimulator:
    """Simulates a single ESP32 motor controller with 3 sensors."""

    def __init__(self, config: MotorConfig, broker_host: str, broker_port: int) -> None:
        self.config = config
        self.motor_id = config.motor_id
        self.connection_type = config.connection_type
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.state = "powered_on"
        # Anti-short-cycle countdown (seconds) — survives MQTT reconnects so an
        # interrupted restart resumes where it left off instead of stalling forever.
        self.restart_seconds_remaining = 0
        # Original RESTART command request_id, echoed in the final ack.
        self.pending_restart_request_id: str | None = None
        self.sensors = self._create_sensors()

    def _create_sensors(self) -> dict[SensorType, Sensor]:
        """Create the 3 sensors based on config and standard defaults."""
        temp_cfg = SENSOR_DEFAULTS["temperature"]
        vib_cfg = SENSOR_DEFAULTS["vibration"]
        cur_cfg = SENSOR_DEFAULTS["current"]
        rated = self.config.rated_current_a
        anomaly_prob = self.config.anomaly_probability

        return {
            SensorType.TEMPERATURE: Sensor(
                sensor_type=SensorType.TEMPERATURE,
                nominal_value=temp_cfg["nominal"],
                healthy_max=temp_cfg["healthy_max"],
                noise_std=temp_cfg["noise_std"],
                plausible_min=temp_cfg["plausible_min"],
                plausible_max=temp_cfg["plausible_max"],
                anomaly_probability=anomaly_prob,
            ),
            SensorType.VIBRATION: Sensor(
                sensor_type=SensorType.VIBRATION,
                nominal_value=vib_cfg["nominal"],
                healthy_max=vib_cfg["healthy_max"],
                noise_std=vib_cfg["noise_std"],
                plausible_min=vib_cfg["plausible_min"],
                plausible_max=vib_cfg["plausible_max"],
                anomaly_probability=anomaly_prob * 0.5,  # vibration less likely
            ),
            SensorType.CURRENT: Sensor(
                sensor_type=SensorType.CURRENT,
                nominal_value=rated * cur_cfg["load_factor"],
                healthy_max=rated * 1.05,
                noise_std=rated * cur_cfg["noise_std_factor"],
                plausible_min=cur_cfg["plausible_min"],
                plausible_max=rated * cur_cfg["plausible_max_factor"],
                anomaly_probability=anomaly_prob,
            ),
        }

    async def run(self) -> None:
        """Main loop: connect, publish current state, run telemetry + commands."""
        while True:
            try:
                lwt = self._build_lwt()
                async with Client(
                    hostname=self.broker_host,
                    port=self.broker_port,
                    username=self.config.mqtt_user,
                    password=self.config.mqtt_pass,
                    will=lwt,
                    identifier=f"esp32_motor{self.motor_id}",
                ) as client:
                    logger.info(f"Motor {self.motor_id}: connected")
                    # Publish our REAL state: an off/restarting motor must not
                    # claim to be online, otherwise the backend will mark it
                    # healthy while it silently stops sending telemetry.
                    await self._publish_status(client, self._liveness_state())
                    await self._subscribe(client)

                    async with asyncio.TaskGroup() as tg:
                        tg.create_task(self._telemetry_loop(client))
                        tg.create_task(self._command_listener(client))
                        # Runs any pending anti-short-cycle countdown (triggered by
                        # a RESTART command or resumed after a reconnect). Lives
                        # inside the TaskGroup so a connection loss cancels it
                        # cleanly while state persists on the instance.
                        tg.create_task(self._restart_supervisor(client))

            except MqttError as e:
                logger.warning(f"Motor {self.motor_id}: connection lost ({e})")
                await asyncio.sleep(self._reconnection_delay())
            except asyncio.CancelledError:
                break

    def _liveness_state(self) -> str:
        """MQTT status we should advertise: online only when fully powered on."""
        return "online" if self.state == "powered_on" else "offline"

    def _build_lwt(self) -> Will:
        """Build the Last Will and Testament (broker publishes this if we drop)."""
        payload = json.dumps({
            "motor_id": self.motor_id,
            "state": "offline",
            "since": datetime.now(timezone.utc).isoformat(),
        })
        return Will(
            topic=f"plant/motor/{self.motor_id}/status",
            payload=payload.encode(),
            qos=1,
            retain=True,
        )

    def _reconnection_delay(self) -> float:
        """WiFi: quick 0-15s reconnect. LAN: slower 5-30s (physical failure)."""
        if self.connection_type == "wifi":
            return random.uniform(0, 15)
        return random.uniform(5, 30)

    async def _subscribe(self, client: Client) -> None:
        """Subscribe to command and QA topics for this motor."""
        motor_prefix = f"plant/motor/{self.motor_id}"
        await client.subscribe(f"{motor_prefix}/cmd", qos=1)
        await client.subscribe(f"{motor_prefix}/sensor/+/cmd", qos=1)
        await client.subscribe(f"qa/motor/{self.motor_id}/inject-fault", qos=1)

    async def _publish_status(self, client: Client, state: str) -> None:
        """Publish online/offline status (retained message)."""
        payload = json.dumps({
            "motor_id": self.motor_id,
            "state": state,
            "since": datetime.now(timezone.utc).isoformat(),
        })
        await client.publish(
            f"plant/motor/{self.motor_id}/status", payload.encode(), qos=1, retain=True
        )

    async def _telemetry_loop(self, client: Client) -> None:
        """Publish telemetry every 15s when powered on."""
        while True:
            await asyncio.sleep(15)
            if self.state != "powered_on":
                continue

            payload = self._build_telemetry_payload()
            await client.publish(
                f"plant/motor/{self.motor_id}/telemetry",
                json.dumps(payload).encode(),
                qos=1,
            )

    async def _restart_supervisor(self, client: Client) -> None:
        """Run any pending anti-short-cycle countdown to completion.

        Listens for a restart being requested (via command) or already pending
        (resumed after a reconnect). Kept as a dedicated task inside the
        TaskGroup so it is cancelled on connection loss without losing the
        countdown state stored on the instance.
        """
        while True:
            if self.state in ("shutting_down", "restarting"):
                await self._restart_countdown(client)
            else:
                await asyncio.sleep(1)

    async def _restart_countdown(self, client: Client) -> None:
        """Execute the countdown: brief shutdown → 100s wait → power on."""
        if self.state == "shutting_down":
            self.state = "restarting"
            if self.restart_seconds_remaining == 0:
                self.restart_seconds_remaining = 100

        topic_prefix = f"plant/motor/{self.motor_id}"
        while self.restart_seconds_remaining > 0 and self.state == "restarting":
            progress = json.dumps({
                "motor_id": self.motor_id,
                "phase": "restarting",
                "seconds_remaining": self.restart_seconds_remaining,
            })
            await client.publish(
                f"{topic_prefix}/restart-progress", progress.encode(), qos=0
            )
            await asyncio.sleep(1)
            self.restart_seconds_remaining -= 1

        # A STOP during the countdown wins: never force power back on.
        if self.state != "restarting":
            return

        # Countdown finished: power back on and report online.
        self.state = "powered_on"
        request_id = self.pending_restart_request_id or "restart-complete"
        self.pending_restart_request_id = None
        await self._publish_status(client, "online")
        await _publish_ack(client, self.motor_id, "cmd/ack", request_id)
        logger.info(f"Motor {self.motor_id}: restart complete, back online")

    def _build_telemetry_payload(self) -> dict:
        """Generate a telemetry payload from all 3 sensors."""
        payload: dict = {
            "motor_id": self.motor_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        temp = self.sensors[SensorType.TEMPERATURE].generate_reading()
        vib = self.sensors[SensorType.VIBRATION].generate_reading()
        cur = self.sensors[SensorType.CURRENT].generate_reading()

        if temp is not None:
            payload["temperature_c"] = temp
        if vib is not None:
            payload["vibration_mm_s"] = vib
        if cur is not None:
            payload["current_a"] = cur
        return payload

    async def _command_listener(self, client: Client) -> None:
        """Listen for commands and delegate to the command handler module."""
        async for message in client.messages:
            topic = str(message.topic)
            try:
                payload = json.loads(message.payload.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue

            if topic.endswith("/cmd") and "sensor" not in topic:
                await handle_motor_command(self, client, payload)
            elif "sensor/" in topic and "/cmd" in topic:
                await handle_sensor_command(self, client, topic, payload)
            elif "inject-fault" in topic:
                handle_fault_injection(self, payload)
