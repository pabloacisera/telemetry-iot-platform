"""
Sensor class — models a single sensor attached to a motor (temperature, vibration, or current).

Each sensor:
- Generates realistic readings with Gaussian noise around a nominal value.
- Has a 3% chance of producing an anomaly (1.3–1.8x multiplication, real anomaly, not a fault).
- Can be put into fault_mode (stuck, out_of_range, disconnected) via QA injection.
- When in fault_mode, generates readings consistent with that fault type.
"""

import random
from enum import Enum
from typing import Optional


class SensorType(str, Enum):
    TEMPERATURE = "temperature"
    VIBRATION = "vibration"
    CURRENT = "current"


class FaultMode(str, Enum):
    NONE = "none"
    STUCK = "stuck"
    OUT_OF_RANGE = "out_of_range"
    DISCONNECTED = "disconnected"


class Sensor:
    """Simulates a single sensor with noise, anomalies, and fault injection."""

    def __init__(
        self,
        sensor_type: SensorType,
        nominal_value: float,
        healthy_max: float,
        noise_std: float,
        plausible_min: float,
        plausible_max: float,
    ) -> None:
        self.sensor_type = sensor_type
        self.nominal_value = nominal_value
        self.healthy_max = healthy_max
        self.noise_std = noise_std
        self.plausible_min = plausible_min
        self.plausible_max = plausible_max

        self.fault_mode: FaultMode = FaultMode.NONE
        self._stuck_value: Optional[float] = None
        self._anomaly_probability: float = 0.03  # 3% chance of real anomaly

    def generate_reading(self) -> Optional[float]:
        """Generate a sensor reading based on current state.

        Returns None if the sensor is disconnected (no data published).
        """
        if self.fault_mode == FaultMode.DISCONNECTED:
            return None

        if self.fault_mode == FaultMode.STUCK:
            if self._stuck_value is None:
                self._stuck_value = round(self.nominal_value, 1)
            return self._stuck_value

        if self.fault_mode == FaultMode.OUT_OF_RANGE:
            # Generate a value clearly outside plausible range
            return round(self.plausible_max * 1.5, 2)

        # Normal operation: Gaussian noise around nominal
        value = random.gauss(self.nominal_value, self.noise_std)

        # 3% chance of real anomaly (not a sensor fault — the motor is actually misbehaving)
        if random.random() < self._anomaly_probability:
            multiplier = random.uniform(1.3, 1.8)
            value = self.nominal_value * multiplier

        # Clamp to physically plausible range (sensors can't read negative temperatures, etc.)
        value = max(self.plausible_min, min(value, self.plausible_max))

        return round(value, 2)

    def inject_fault(self, mode: FaultMode) -> None:
        """Activate a fault mode (called by QA injection)."""
        self.fault_mode = mode
        if mode == FaultMode.STUCK:
            # Lock the current reading as the stuck value
            self._stuck_value = round(self.nominal_value, 1)

    def clear_fault(self) -> None:
        """Clear fault mode (called after sensor restart)."""
        self.fault_mode = FaultMode.NONE
        self._stuck_value = None
