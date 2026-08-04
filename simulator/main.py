"""
Orchestrator — creates and runs MotorSimulator instances concurrently.

This is the entry point for the simulator. It:
1. Loads configuration (motor list + MQTT broker details).
2. Creates initial MotorSimulator instances (one per configured motor).
3. Runs all in parallel using asyncio (no blocking threads).
4. Listens for hot-reload commands via MQTT (add/remove motors at runtime).
5. Handles graceful shutdown on SIGINT/SIGTERM.
"""

import asyncio
import json
import logging
import os
import signal
import sys

from aiomqtt import Client, MqttError
from dotenv import load_dotenv

from simulator.config import build_motors_config, MotorConfig
from simulator.motor_simulator import MotorSimulator

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def get_broker_config() -> tuple[str, int]:
    """Get MQTT broker connection details from environment."""
    host = os.getenv("MQTT_BROKER_HOST", "localhost")
    port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    return host, port


def get_motors() -> list[MotorConfig]:
    """Build motor configurations.

    In production, passwords come from environment variables.
    For development, uses the default dev passwords matching mosquitto/generate_passwords.py.
    """
    password_prefix = os.getenv("MQTT_ESP32_PASS_PREFIX", "esp32_dev_pass_")
    return build_motors_config(mqtt_pass_prefix=password_prefix)


async def run_all(broker_host: str, broker_port: int, motors: list[MotorConfig]) -> None:
    """Run all motor simulators concurrently + hot-reload listener."""
    # Track active simulators: motor_id → (MotorSimulator, asyncio.Task)
    active: dict[int, tuple[MotorSimulator, asyncio.Task]] = {}

    # Start initial simulators
    for motor in motors:
        sim = MotorSimulator(config=motor, broker_host=broker_host, broker_port=broker_port)
        task = asyncio.create_task(sim.run())
        active[motor.motor_id] = (sim, task)

    logger.info(f"Started {len(active)} motor simulators")
    logger.info(f"Broker: {broker_host}:{broker_port}")
    logger.info(
        f"Connection types: "
        f"{sum(1 for m in motors if m.connection_type == 'wifi')} WiFi, "
        f"{sum(1 for m in motors if m.connection_type == 'lan')} LAN"
    )

    # Shutdown event
    shutdown_event = asyncio.Event()

    def handle_signal() -> None:
        logger.info("Shutdown signal received, stopping all simulators...")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_signal)

    # Hot-reload listener: listens for motor-added / motor-removed commands
    hot_reload_task = asyncio.create_task(
        _hot_reload_listener(broker_host, broker_port, active)
    )

    # Wait for shutdown
    await shutdown_event.wait()

    # Cancel hot-reload listener
    hot_reload_task.cancel()

    # Cancel all simulator tasks
    for motor_id, (sim, task) in active.items():
        task.cancel()

    all_tasks = [task for _, task in active.values()] + [hot_reload_task]
    await asyncio.gather(*all_tasks, return_exceptions=True)
    logger.info("All simulators stopped.")


async def _hot_reload_listener(
    broker_host: str,
    broker_port: int,
    active: dict[int, tuple[MotorSimulator, asyncio.Task]],
) -> None:
    """Listen on system/simulator/# for add/remove motor commands from backend.

    Expected payloads:
      motor-added: { "motorId": 16, "ratedCurrentA": 12.5, "connectionType": "Y", "mqttUser": "esp32_motor16", "mqttPass": "..." }
      motor-removed: { "motorId": 16 }
    """
    backend_user = os.getenv("MQTT_BACKEND_USER", "backend_service")
    backend_pass = os.getenv("MQTT_BACKEND_PASS", "backend_dev_pass")

    while True:
        try:
            async with Client(
                hostname=broker_host,
                port=broker_port,
                username=backend_user,
                password=backend_pass,
                identifier="simulator_hot_reload",
            ) as client:
                await client.subscribe("system/simulator/#", qos=1)
                logger.info("Hot-reload listener subscribed to system/simulator/#")

                async for message in client.messages:
                    topic = str(message.topic)
                    try:
                        payload = json.loads(message.payload.decode())
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue

                    if topic == "system/simulator/motor-added":
                        await _handle_motor_added(payload, active, broker_host, broker_port)
                    elif topic == "system/simulator/motor-removed":
                        await _handle_motor_removed(payload, active)

        except MqttError as e:
            logger.warning(f"Hot-reload listener connection lost ({e}), reconnecting in 5s...")
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            break


async def _handle_motor_added(
    payload: dict,
    active: dict[int, tuple[MotorSimulator, asyncio.Task]],
    broker_host: str,
    broker_port: int,
) -> None:
    """Add a new MotorSimulator at runtime."""
    motor_id = payload.get("motorId")
    if not motor_id:
        logger.warning("motor-added: missing motorId in payload")
        return

    if motor_id in active:
        logger.warning(f"motor-added: motor {motor_id} already running, ignoring")
        return

    rated_current = payload.get("ratedCurrentA", 10.0)
    connection_type = "wifi" if payload.get("connectionType", "Y") in ("Y", "wifi") else "lan"
    mqtt_user = payload.get("mqttUser", f"esp32_motor{motor_id}")
    mqtt_pass = payload.get("mqttPass")

    if not mqtt_pass:
        logger.warning(f"motor-added: missing mqttPass for motor {motor_id}")
        return

    config = MotorConfig(
        motor_id=motor_id,
        rated_current_a=rated_current,
        connection_type=connection_type,
        mqtt_user=mqtt_user,
        mqtt_pass=mqtt_pass,
    )

    sim = MotorSimulator(config=config, broker_host=broker_host, broker_port=broker_port)
    task = asyncio.create_task(sim.run())
    active[motor_id] = (sim, task)
    logger.info(f"Hot-reload: started simulator for motor {motor_id} (user={mqtt_user})")


async def _handle_motor_removed(
    payload: dict,
    active: dict[int, tuple[MotorSimulator, asyncio.Task]],
) -> None:
    """Remove and stop a MotorSimulator at runtime."""
    motor_id = payload.get("motorId")
    if not motor_id:
        logger.warning("motor-removed: missing motorId in payload")
        return

    if motor_id not in active:
        logger.warning(f"motor-removed: motor {motor_id} not running, ignoring")
        return

    sim, task = active.pop(motor_id)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info(f"Hot-reload: stopped simulator for motor {motor_id}")


def main() -> None:
    """Entry point."""
    broker_host, broker_port = get_broker_config()
    motors = get_motors()

    try:
        asyncio.run(run_all(broker_host, broker_port, motors))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
