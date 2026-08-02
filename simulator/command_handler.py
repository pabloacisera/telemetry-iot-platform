"""
Command handler — processes incoming MQTT commands for a motor simulator.

Handles:
- Motor commands (stop, restart with 100s anti-short-cycle timer).
- Sensor commands (restart_sensor with 5s boot time).
- QA fault injection (activates fault modes on individual sensors).

Separated from MotorSimulator to keep each file under ~200 lines
and isolate command/response logic from telemetry generation.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from aiomqtt import Client

from simulator.sensor import FaultMode, SensorType

if TYPE_CHECKING:
    from simulator.motor_simulator import MotorSimulator

logger = logging.getLogger(__name__)


async def handle_motor_command(
    sim: "MotorSimulator", client: Client, payload: dict
) -> None:
    """Handle motor-level commands (stop, restart)."""
    action = payload.get("action")
    request_id = payload.get("request_id", "unknown")

    if action == "stop":
        logger.info(f"Motor {sim.motor_id}: received STOP command")
        sim.state = "powered_off"
        await _publish_ack(client, sim.motor_id, "cmd/ack", request_id)

    elif action == "restart":
        logger.info(f"Motor {sim.motor_id}: received RESTART command")
        asyncio.create_task(_restart_sequence(sim, client, request_id))


async def handle_sensor_command(
    sim: "MotorSimulator", client: Client, topic: str, payload: dict
) -> None:
    """Handle sensor-level commands (restart_sensor with 5s boot time)."""
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
        logger.warning(f"Motor {sim.motor_id}: unknown sensor type '{sensor_type_str}'")
        return

    logger.info(f"Motor {sim.motor_id}: restarting sensor {sensor_type.value}")

    # 5-second boot time (real ESP32 boot duration)
    await asyncio.sleep(5)
    sim.sensors[sensor_type].clear_fault()

    ack_topic = f"plant/motor/{sim.motor_id}/sensor/{sensor_type.value}/cmd/ack"
    await _publish_ack(client, sim.motor_id, f"sensor/{sensor_type.value}/cmd/ack", request_id)
    logger.info(f"Motor {sim.motor_id}: sensor {sensor_type.value} restart complete")


def handle_fault_injection(sim: "MotorSimulator", payload: dict) -> None:
    """Handle QA fault injection (activate fault mode on a sensor)."""
    sensor_type_str = payload.get("sensor_type")
    fault_mode_str = payload.get("fault_mode")

    try:
        sensor_type = SensorType(sensor_type_str)
        fault_mode = FaultMode(fault_mode_str)
    except (ValueError, KeyError):
        logger.warning(f"Motor {sim.motor_id}: invalid fault injection: {payload}")
        return

    sim.sensors[sensor_type].inject_fault(fault_mode)
    logger.info(f"Motor {sim.motor_id}: fault → {sensor_type.value}/{fault_mode.value}")


async def _restart_sequence(
    sim: "MotorSimulator", client: Client, request_id: str
) -> None:
    """Execute the full restart: shutdown → 100s wait → power on."""
    # Phase 1: shutting down (brief network/ack time)
    sim.state = "shutting_down"
    await asyncio.sleep(1)

    # Phase 2: restarting with real 100s anti-short-cycle timer
    sim.state = "restarting"
    topic_prefix = f"plant/motor/{sim.motor_id}"

    for seconds_remaining in range(100, 0, -1):
        progress = json.dumps({
            "motor_id": sim.motor_id,
            "phase": "restarting",
            "seconds_remaining": seconds_remaining,
        })
        await client.publish(
            f"{topic_prefix}/restart-progress", progress.encode(), qos=0
        )
        await asyncio.sleep(1)

    # Phase 3: powered back on
    sim.state = "powered_on"
    await _publish_ack(client, sim.motor_id, "cmd/ack", request_id)
    logger.info(f"Motor {sim.motor_id}: restart complete, back online")


async def _publish_ack(
    client: Client, motor_id: int, ack_suffix: str, request_id: str
) -> None:
    """Publish a command acknowledgment message."""
    topic = f"plant/motor/{motor_id}/{ack_suffix}"
    payload = json.dumps({
        "request_id": request_id,
        "status": "done",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    await client.publish(topic, payload.encode(), qos=1)
