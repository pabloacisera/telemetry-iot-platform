"""
Tests for the Sensor class.

Covers:
- Normal reading generation (within plausible range).
- Fault mode: stuck (same value every time).
- Fault mode: out_of_range (value exceeds plausible max).
- Fault mode: disconnected (returns None).
- Fault clearing restores normal operation.
- Fault on one sensor does NOT affect other sensors.
"""

import pytest

from simulator.sensor import FaultMode, Sensor, SensorType


@pytest.fixture
def temperature_sensor() -> Sensor:
    return Sensor(
        sensor_type=SensorType.TEMPERATURE,
        nominal_value=55.0,
        healthy_max=70.0,
        noise_std=3.0,
        plausible_min=10.0,
        plausible_max=150.0,
    )


@pytest.fixture
def vibration_sensor() -> Sensor:
    return Sensor(
        sensor_type=SensorType.VIBRATION,
        nominal_value=1.2,
        healthy_max=1.8,
        noise_std=0.2,
        plausible_min=0.0,
        plausible_max=20.0,
    )


@pytest.fixture
def current_sensor() -> Sensor:
    return Sensor(
        sensor_type=SensorType.CURRENT,
        nominal_value=10.2,  # 12.0 * 0.85
        healthy_max=12.6,    # 12.0 * 1.05
        noise_std=0.36,      # 12.0 * 0.03
        plausible_min=0.0,
        plausible_max=36.0,  # 12.0 * 3.0
    )


class TestNormalOperation:
    """Test that normal readings are within plausible range."""

    def test_temperature_within_range(self, temperature_sensor: Sensor) -> None:
        for _ in range(100):
            reading = temperature_sensor.generate_reading()
            assert reading is not None
            assert 10.0 <= reading <= 150.0

    def test_vibration_within_range(self, vibration_sensor: Sensor) -> None:
        for _ in range(100):
            reading = vibration_sensor.generate_reading()
            assert reading is not None
            assert 0.0 <= reading <= 20.0

    def test_current_within_range(self, current_sensor: Sensor) -> None:
        for _ in range(100):
            reading = current_sensor.generate_reading()
            assert reading is not None
            assert 0.0 <= reading <= 36.0

    def test_reading_is_rounded_to_2_decimals(self, temperature_sensor: Sensor) -> None:
        for _ in range(50):
            reading = temperature_sensor.generate_reading()
            assert reading is not None
            # Check that it has at most 2 decimal places
            assert reading == round(reading, 2)


class TestFaultModeStuck:
    """Test stuck fault mode: same value every time."""

    def test_stuck_returns_same_value(self, vibration_sensor: Sensor) -> None:
        vibration_sensor.inject_fault(FaultMode.STUCK)
        readings = [vibration_sensor.generate_reading() for _ in range(20)]
        assert all(r == readings[0] for r in readings)

    def test_stuck_value_is_nominal_rounded(self, vibration_sensor: Sensor) -> None:
        vibration_sensor.inject_fault(FaultMode.STUCK)
        reading = vibration_sensor.generate_reading()
        assert reading == round(vibration_sensor.nominal_value, 1)


class TestFaultModeOutOfRange:
    """Test out_of_range fault mode: value exceeds plausible max."""

    def test_out_of_range_exceeds_plausible(self, temperature_sensor: Sensor) -> None:
        temperature_sensor.inject_fault(FaultMode.OUT_OF_RANGE)
        reading = temperature_sensor.generate_reading()
        assert reading is not None
        assert reading > temperature_sensor.plausible_max


class TestFaultModeDisconnected:
    """Test disconnected fault mode: returns None (no data published)."""

    def test_disconnected_returns_none(self, current_sensor: Sensor) -> None:
        current_sensor.inject_fault(FaultMode.DISCONNECTED)
        reading = current_sensor.generate_reading()
        assert reading is None


class TestFaultClearing:
    """Test that clearing a fault restores normal operation."""

    def test_clear_stuck_restores_normal(self, vibration_sensor: Sensor) -> None:
        vibration_sensor.inject_fault(FaultMode.STUCK)
        stuck_reading = vibration_sensor.generate_reading()

        vibration_sensor.clear_fault()

        # After clearing, readings should vary (not all the same)
        readings = [vibration_sensor.generate_reading() for _ in range(20)]
        unique_values = set(readings)
        assert len(unique_values) > 1  # should have variation now

    def test_clear_disconnected_restores_readings(self, temperature_sensor: Sensor) -> None:
        temperature_sensor.inject_fault(FaultMode.DISCONNECTED)
        assert temperature_sensor.generate_reading() is None

        temperature_sensor.clear_fault()
        reading = temperature_sensor.generate_reading()
        assert reading is not None
        assert 10.0 <= reading <= 150.0


class TestSensorIsolation:
    """Test that a fault on one sensor does NOT affect others."""

    def test_fault_isolation(self) -> None:
        temp = Sensor(SensorType.TEMPERATURE, 55.0, 70.0, 3.0, 10.0, 150.0)
        vib = Sensor(SensorType.VIBRATION, 1.2, 1.8, 0.2, 0.0, 20.0)
        cur = Sensor(SensorType.CURRENT, 10.2, 12.6, 0.36, 0.0, 36.0)

        # Inject fault on vibration only
        vib.inject_fault(FaultMode.DISCONNECTED)

        # Temperature and current should still produce normal readings
        for _ in range(20):
            assert temp.generate_reading() is not None
            assert cur.generate_reading() is not None

        # Vibration is disconnected
        assert vib.generate_reading() is None
