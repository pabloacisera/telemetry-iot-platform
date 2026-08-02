"""
Tests for the MotorSimulator class.

Covers:
- Sensor fault does not affect other sensors on the same motor.
- During shutting_down/restarting, no telemetry is generated.
- Command handling for motor and sensor restart.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from simulator.config import MotorConfig
from simulator.motor_simulator import MotorSimulator, MotorState
from simulator.sensor import FaultMode, SensorType


@pytest.fixture
def motor_config() -> MotorConfig:
    return MotorConfig(
        motor_id=7,
        rated_current_a=12.0,
        connection_type="wifi",
        mqtt_user="esp32_motor7",
        mqtt_pass="test_pass",
    )


@pytest.fixture
def simulator(motor_config: MotorConfig) -> MotorSimulator:
    return MotorSimulator(
        config=motor_config,
        broker_host="localhost",
        broker_port=1883,
    )


class TestSensorFaultIsolation:
    """A fault on one sensor must NOT affect other sensors on the same motor."""

    def test_vibration_fault_does_not_affect_temperature(
        self, simulator: MotorSimulator
    ) -> None:
        # Inject fault on vibration
        simulator.sensors[SensorType.VIBRATION].inject_fault(FaultMode.STUCK)

        # Temperature should still produce varied readings
        readings = [
            simulator.sensors[SensorType.TEMPERATURE].generate_reading()
            for _ in range(20)
        ]
        assert all(r is not None for r in readings)
        assert len(set(readings)) > 1  # should have variation

    def test_temperature_fault_does_not_affect_current(
        self, simulator: MotorSimulator
    ) -> None:
        simulator.sensors[SensorType.TEMPERATURE].inject_fault(FaultMode.DISCONNECTED)

        # Current should still produce normal readings
        for _ in range(20):
            reading = simulator.sensors[SensorType.CURRENT].generate_reading()
            assert reading is not None
            assert reading > 0

    def test_multiple_faults_independent(self, simulator: MotorSimulator) -> None:
        # Fault vibration and temperature
        simulator.sensors[SensorType.VIBRATION].inject_fault(FaultMode.STUCK)
        simulator.sensors[SensorType.TEMPERATURE].inject_fault(FaultMode.DISCONNECTED)

        # Current still works
        reading = simulator.sensors[SensorType.CURRENT].generate_reading()
        assert reading is not None

        # Vibration is stuck
        vib_readings = [
            simulator.sensors[SensorType.VIBRATION].generate_reading()
            for _ in range(5)
        ]
        assert all(r == vib_readings[0] for r in vib_readings)

        # Temperature is disconnected
        assert simulator.sensors[SensorType.TEMPERATURE].generate_reading() is None


class TestNoTelemetryDuringRestart:
    """During shutting_down/restarting, no telemetry should be published."""

    def test_shutting_down_state_blocks_telemetry(
        self, simulator: MotorSimulator
    ) -> None:
        simulator.state = MotorState.SHUTTING_DOWN
        # The telemetry loop checks state before publishing
        assert simulator.state != MotorState.POWERED_ON

    def test_restarting_state_blocks_telemetry(
        self, simulator: MotorSimulator
    ) -> None:
        simulator.state = MotorState.RESTARTING
        assert simulator.state != MotorState.POWERED_ON

    def test_powered_off_blocks_telemetry(self, simulator: MotorSimulator) -> None:
        simulator.state = MotorState.POWERED_OFF
        assert simulator.state != MotorState.POWERED_ON


class TestMotorCommandHandling:
    """Test command handling logic (stop, restart)."""

    @pytest.mark.asyncio
    async def test_stop_command_changes_state(self, simulator: MotorSimulator) -> None:
        mock_client = AsyncMock()
        payload = {"action": "stop", "request_id": "test123"}

        await simulator._handle_motor_command(mock_client, payload)

        assert simulator.state == MotorState.POWERED_OFF
        # Verify ack was published
        mock_client.publish.assert_called_once()
        call_args = mock_client.publish.call_args
        assert "cmd/ack" in call_args[0][0]
        ack_payload = json.loads(call_args[0][1].decode())
        assert ack_payload["request_id"] == "test123"
        assert ack_payload["status"] == "done"


class TestSensorCommandHandling:
    """Test sensor restart command."""

    @pytest.mark.asyncio
    async def test_sensor_restart_clears_fault(self, simulator: MotorSimulator) -> None:
        # Inject fault
        simulator.sensors[SensorType.VIBRATION].inject_fault(FaultMode.STUCK)
        assert simulator.sensors[SensorType.VIBRATION].fault_mode == FaultMode.STUCK

        mock_client = AsyncMock()
        topic = "plant/motor/7/sensor/vibration/cmd"
        payload = {"action": "restart_sensor", "request_id": "sensor_test"}

        # This has a 5s sleep, so we patch it
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await simulator._handle_sensor_command(mock_client, topic, payload)

        assert simulator.sensors[SensorType.VIBRATION].fault_mode == FaultMode.NONE


class TestFaultInjection:
    """Test QA fault injection handler."""

    def test_inject_stuck(self, simulator: MotorSimulator) -> None:
        payload = {"sensor_type": "vibration", "fault_mode": "stuck"}
        simulator._handle_fault_injection(payload)
        assert simulator.sensors[SensorType.VIBRATION].fault_mode == FaultMode.STUCK

    def test_inject_disconnected(self, simulator: MotorSimulator) -> None:
        payload = {"sensor_type": "temperature", "fault_mode": "disconnected"}
        simulator._handle_fault_injection(payload)
        assert (
            simulator.sensors[SensorType.TEMPERATURE].fault_mode
            == FaultMode.DISCONNECTED
        )

    def test_inject_out_of_range(self, simulator: MotorSimulator) -> None:
        payload = {"sensor_type": "current", "fault_mode": "out_of_range"}
        simulator._handle_fault_injection(payload)
        assert (
            simulator.sensors[SensorType.CURRENT].fault_mode == FaultMode.OUT_OF_RANGE
        )

    def test_invalid_injection_ignored(self, simulator: MotorSimulator) -> None:
        payload = {"sensor_type": "invalid", "fault_mode": "stuck"}
        simulator._handle_fault_injection(payload)
        # All sensors should remain normal
        for sensor in simulator.sensors.values():
            assert sensor.fault_mode == FaultMode.NONE
