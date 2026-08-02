"""
Orchestrator — creates and runs 15 MotorSimulator instances concurrently.

This is the entry point for the simulator. It:
1. Loads configuration (motor list + MQTT broker details).
2. Creates 15 MotorSimulator instances, one per motor.
3. Runs all 15 in parallel using asyncio (no blocking threads).
4. Handles graceful shutdown on SIGINT/SIGTERM.
"""

import asyncio
import logging
import os
import signal
import sys

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
    """Run all motor simulators concurrently."""
    simulators = [
        MotorSimulator(config=motor, broker_host=broker_host, broker_port=broker_port)
        for motor in motors
    ]

    logger.info(f"Starting {len(simulators)} motor simulators...")
    logger.info(f"Broker: {broker_host}:{broker_port}")
    logger.info(
        f"Connection types: "
        f"{sum(1 for m in motors if m.connection_type == 'wifi')} WiFi, "
        f"{sum(1 for m in motors if m.connection_type == 'lan')} LAN"
    )

    # Run all simulators as concurrent tasks
    tasks = [asyncio.create_task(sim.run()) for sim in simulators]

    # Wait for shutdown signal
    shutdown_event = asyncio.Event()

    def handle_signal() -> None:
        logger.info("Shutdown signal received, stopping all simulators...")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_signal)

    await shutdown_event.wait()

    # Cancel all tasks gracefully
    for task in tasks:
        task.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("All simulators stopped.")


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
