"""
MotorSimulator class — models a single ESP32 with 3 sensors and MQTT connectivity.

Responsibilities:
- Maintains its own MQTT connection with LWT configured.
- Publishes telemetry every 15 seconds (when powered on and not restarting).
- Responds to motor commands (stop, restart) and sensor commands (restart_sensor).
- Publishes restart-progress countdown during motor restart (100s).
- Handles QA fault injection on individual sensors.
- Simulates WiFi/LAN reconnection behavior differences.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from aiomqtt import Client, MqttError, Will

from simulator.sensor import FaultMode, Sensor, SensorType
from simulator.config import MotorConfig, SENSOR_DEFAULTS

logger = logging.getLogger(__name__)


class MotorState:
    """Tracks the operational state of the simulated motor."""

    POWERED_ON = "powered_on"
    SHUTTING_DOWN = "shutting_down"
    RESTARTING = "restarting"
    POWERED_OFF = "powered_off"


class MotorSimulator:
    """Simulates a single ESP32 motor controller with 3 sensors."""

    def __init__(self, config: MotorConfig, broker_host: str, broker_port: int) -> None:
        self.config = config
        self.motor_id = config.motor_id
        self.connection_type = config.connection_type
        self.broker_host = broker_host
        self.broker_port = broker_port

        self.state = MotorState.POWERED_ON
        self._restart_task: Optional[asyncio.Task] = None

        # Initialize 3 sensors
        self.sensors = self._create_sensors()

    def _create_sensors(self) -> dict[SensorType, Sensor]:
        """Create the 3 sensors based on config and standard defaults."""
        temp_cfg = SENSOR_DEFAULTS["temperature"]
        vib_cfg = SENSOR_DEFAULTS["vibration"]
        cur_cfg = SENSOR_DEFAULTS["current"]

        rated = self.config.rated_current_a

        return {
            SensorType.TEMPERATURE: Sensor(
                sensor_type=SensorType.TEMPERATURE,
                nominal_value=temp_cfg["nominal"],
                healthy_max=temp_cfg["healthy_max"],
                noise_std=temp_cfg["noise_std"],
                plausible_min=temp_cfg["plausible_min"],
                plausible_max=temp_cfg["plausible_max"],
            ),
            SensorType.VIBRATION: Sensor(
                sensor_type=SensorType.VIBRATION,
                nominal_value=vib_cfg["nominal"],
                healthy_max=vib_cfg["healthy_max"],
                noise_std=vib_cfg["noise_std"],
                plausible_min=vib_cfg["plausible_min"],
                plausible_max=vib_cfg["plausible_max"],
            ),
            SensorType.CURRENT: Sensor(
                sensor_type=SensorType.CURRENT,
                nominal_value=rated * cur_cfg["load_factor"],
                healthy_max=rated * 1.05,
                noise_std=rated * cur_cfg["noise_std_factor"],
                plausible_min=cur_cfg["plausible_min"],
                plausible_max=rated * cur_cfg["plausible_max_factor"],
            ),
        }

    def _topic(self, suffix: str) -> str:
        """Build a topic string for this motor."""
        return f"plant/motor/{self.motor_id}/{suffix}"

    def _lwt_message(self) -> Will:
        """Build the Last Will and Testament message (offline status)."""
        payload = json.dumps({
            "motor_id": self.motor_id,
            "state": "offline",
            "since": datetime.now(timezone.utc).isoformat(),
        })
        return Will(
            topic=self._topic("status"),
            payload=payload.encode(),
            qos=1,
            retain=True,
        )

    async def run(self) -> None:
        """Main loop: connect, publish online, start telemetry, listen for commands."""
        while True:
            try:
                async with Client(
                    hostname=self.broker_host,
                    port=self.broker_port,
                    username=self.config.mqtt_user,
                    password=self.config.mqtt_pass,
                    will=self._lwt_message(),
                    clean_session=False,
                    client_id=f"esp32_motor{self.motor_id}",
                ) as client:
                    logger.info(f"Motor {self.motor_id}: connected to broker")

                    # Publish online status (retained)
                    await self._publish_status(client, "online")

                    # Subscribe to command topics
                    await client.subscribe(self._topic("cmd"), qos=1)
                    await client.subscribe(
                        f"plant/motor/{self.motor_id}/sensor/+/cmd", qos=1
                    )
                    await client.subscribe(
                        f"qa/motor/{self.motor_id}/inject-fault", qos=1
                    )

                    # Run telemetry and command listener concurrently
                    async with asyncio.TaskGroup() as tg:
                        tg.create_task(self._telemetry_loop(client))
                        tg.create_task(self._command_listener(client))

            except MqttError as e:
                logger.warning(
                    f"Motor {self.motor_id}: MQTT connection lost ({e}), reconnecting..."
                )
                delay = self._reconnection_delay()
                await asyncio.sleep(delay)
            except asyncio.CancelledError:
                logger.info(f"Motor {self.motor_id}: shutting down")
                break

    def _reconnection_delay(self) -> float:
        """Calculate reconnection delay based on connection type."""
        import random

        if self.connection_type == "wifi":
            # WiFi: quick reconnect (0-15s), models transient interference
            return random.uniform(0, 15)
        else:
            # LAN: longer delay (5-30s), models physical failure
            return random.uniform(5, 30)

    async def _publish_status(self, client: Client, state: str) -> None:
        """Publish connection status (retained)."""
        payload = json.dumps({
            "motor_id": self.motor_id,
            "state": state,
            "since": datetime.now(timezone.utc).isoformat(),
        })
        await client.publish(
            self._topic("status"), payload.encode(), qos=1, retain=True
        )

    async def _telemetry_loop(self, client: Client) -> None:
        """Publish telemetry every 15 seconds when powered on."""
        while True:
            await asyncio.sleep(15)

            if self.state != MotorState.POWERED_ON:
                continue

            # Generate readings from all 3 sensors
            temp_reading = self.sensors[SensorType.TEMPERATURE].generate_reading()
            vib_reading = self.sensors[SensorType.VIBRATION].generate_reading()
            cur_reading = self.sensors[SensorType.CURRENT].generate_reading()

            # If a sensor is disconnected, it returns None — we still publish
            # the other values (the backend handles missing fields)
            payload = {
                "motor_id": self.motor_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            if temp_reading is not None:
                payload["temperature_c"] = temp_reading
            if vib_reading is not None:
                payload["vibration_mm_s"] = vib_reading
            if cur_reading is not None:
                payload["current_a"] = cur_reading

            await client.publish(
                self._topic("telemetry"),
                json.dumps(payload).encode(),
                qos=1,
            )
            logger.debug(
                f"Motor {self.motor_id}: telemetry published "
                f"(T={temp_reading}, V={vib_reading}, I={cur_reading})"
            )

    async def _command_listener(self, client: Client) -> None:
        """Listen for motor commands, sensor commands, and QA fault injection."""
        async for message in client.messages:
            topic = str(message.topic)
            try:
                payload = json.loads(message.payload.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                logger.warning(f"Motor {self.motor_id}: invalid payload on {topic}")
                continue

            if topic == self._topic("cmd"):
                await self._handle_motor_command(client, payload)
            elif "sensor/" in topic and "/cmd" in topic:
                await self._handle_sensor_command(client, topic, payload)
            elif "inject-fault" in topic:
                self._handle_fault_injection(payload)

    async def _handle_motor_command(
        self, client: Client, payload: dict
    ) -> None:
        """Handle motor-level commands (stop, restart)."""
        action = payload.get("action")
        request_id = payload.get("request_id", "unknown")

        if action == "stop":
            logger.info(f"Motor {self.motor_id}: received STOP command")
            self.state = MotorState.POWERED_OFF
            await self._publish_ack(client, self._topic("cmd/ack"), request_id)

        elif action == "restart":
            logger.info(f"Motor {self.motor_id}: received RESTART command")
            self._restart_task = asyncio.create_task(
                self._restart_sequence(client, request_id)
            )

    async def _restart_sequence(self, client: Client, request_id: str) -> None:
        """Execute the full restart sequence: shutdown → wait 100s → power on."""
        # Phase 1: shutting down
        self.state = MotorState.SHUTTING_DOWN
        await asyncio.sleep(1)  # brief network/ack time

        # Phase 2: restarting (100s anti-short-cycle timer)
        self.state = MotorState.RESTARTING

        for seconds_remaining in range(100, 0, -1):
            progress_payload = json.dumps({
                "motor_id": self.motor_id,
                "phase": "restarting",
                "seconds_remaining": seconds_remaining,
            })
            await client.publish(
                self._topic("restart-progress"),
                progress_payload.encode(),
                qos=0,  # QoS 0 for progress — cosmetic, not critical
            )
            await asyncio.sleep(1)

        # Phase 3: powered back on
        self.state = MotorState.POWERED_ON
        await self._publish_ack(client, self._topic("cmd/ack"), request_id)
        logger.info(f"Motor {self.motor_id}: restart complete, back online")

    async def _handle_sensor_command(
        self, client: Client, topic: str, payload: dict
    ) -> None:
        """Handle sensor-level commands (restart_sensor)."""
        action = payload.get("action")
        request_id = payload.get("request_id", "unknown")

        if action != "restart_sensor":
            return

        # Extract sensor type from topic: plant/motor/{id}/sensor/{type}/cmd
        parts = topic.split("/")
        sensor_type_str = parts[4] if len(parts) > 4 else None

        try:
            sensor_type = SensorType(sensor_type_str)
        except ValueError:
            logger.warning(f"Motor {self.motor_id}: unknown sensor type '{sensor_type_str}'")
            return

        logger.info(f"Motor {self.motor_id}: restarting sensor {sensor_type.value}")

        # 5-second boot time for sensor restart
        await asyncio.sleep(5)
        self.sensors[sensor_type].clear_fault()

        # Publish ack on the sensor-specific ack topic
        ack_topic = f"plant/motor/{self.motor_id}/sensor/{sensor_type.value}/cmd/ack"
        await self._publish_ack(client, ack_topic, request_id)
        logger.info(f"Motor {self.motor_id}: sensor {sensor_type.value} restart complete")

    def _handle_fault_injection(self, payload: dict) -> None:
        """Handle QA fault injection (activate fault mode on a sensor)."""
        sensor_type_str = payload.get("sensor_type")
        fault_mode_str = payload.get("fault_mode")

        try:
            sensor_type = SensorType(sensor_type_str)
            fault_mode = FaultMode(fault_mode_str)
        except (ValueError, KeyError):
            logger.warning(
                f"Motor {self.motor_id}: invalid fault injection payload: {payload}"
            )
            return

        self.sensors[sensor_type].inject_fault(fault_mode)
        logger.info(
            f"Motor {self.motor_id}: fault injected on {sensor_type.value} → {fault_mode.value}"
        )

    async def _publish_ack(self, client: Client, topic: str, request_id: str) -> None:
        """Publish a command acknowledgment."""
        payload = json.dumps({
            "request_id": request_id,
            "status": "done",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await client.publish(topic, payload.encode(), qos=1)
