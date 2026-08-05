"""
Sensor class — models a single sensor attached to a motor (temperature, vibration, or current).

Each sensor:
- Generates realistic readings with Gaussian noise around a nominal value.
- Can enter anomaly EPISODES (sustained anomalous behavior, not single spikes).
- Episodes have severity (mild/moderate/severe) and duration (4-12 readings).
- Can be put into fault_mode (stuck, out_of_range, disconnected) via QA injection.

Anomaly episodes model real industrial degradation:
- mild:     warning zone only → motor alarm but auto-recovers
- moderate: warning → critical gradually → grace timer gives operator time
- severe:   critical immediately → real trip
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


class AnomalySeverity(str, Enum):
    MILD = "mild"           # warning zone only — motor alarm, auto-recovers
    MODERATE = "moderate"   # warning → critical gradually — grace timer
    SEVERE = "severe"       # critical immediately — real trip


class Sensor:
    """Simulates a single sensor with noise, anomaly episodes, and fault injection."""

    def __init__(
        self,
        sensor_type: SensorType,
        nominal_value: float,
        healthy_max: float,
        noise_std: float,
        plausible_min: float,
        plausible_max: float,
        anomaly_probability: float = 0.02,
    ) -> None:
        self.sensor_type = sensor_type
        self.nominal_value = nominal_value
        self.healthy_max = healthy_max
        self.noise_std = noise_std
        self.plausible_min = plausible_min
        self.plausible_max = plausible_max
        self._anomaly_probability = anomaly_probability

        self.fault_mode: FaultMode = FaultMode.NONE
        self._stuck_value: Optional[float] = None

        # Anomaly episode state
        self._episode_active: bool = False
        self._episode_remaining: int = 0
        self._episode_severity: AnomalySeverity = AnomalySeverity.MILD
        self._episode_target: float = 0.0  # target value for the episode

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
            return round(self.plausible_max * 1.5, 2)

        # Check if we're in an anomaly episode
        if self._episode_active:
            value = self._generate_episode_reading()
            self._episode_remaining -= 1

            # Early recovery: 15% chance per reading to end episode prematurely
            if self._episode_remaining > 0 and random.random() < 0.15:
                self._end_episode()
            elif self._episode_remaining <= 0:
                self._end_episode()

            return round(value, 2)

        # Normal operation: Gaussian noise around nominal
        value = random.gauss(self.nominal_value, self.noise_std)

        # Chance to start a new anomaly episode
        if random.random() < self._anomaly_probability:
            self._start_episode()

        # Clamp to physically plausible range
        value = max(self.plausible_min, min(value, self.plausible_max))

        return round(value, 2)

    def _start_episode(self) -> None:
        """Start a new anomaly episode with random severity and duration."""
        roll = random.random()
        if roll < 0.40:
            self._episode_severity = AnomalySeverity.MILD
        elif roll < 0.75:
            self._episode_severity = AnomalySeverity.MODERATE
        else:
            self._episode_severity = AnomalySeverity.SEVERE

        # Duration: 4-12 readings (60-180 seconds at 15s intervals)
        self._episode_remaining = random.randint(4, 12)
        self._episode_active = True

        # Calculate target value based on severity
        # Warning zone: 1.3x - 1.45x nominal
        # Critical zone: > 1.64x nominal (for temperature)
        if self._episode_severity == AnomalySeverity.MILD:
            # Stay in warning zone: 1.3x - 1.45x
            multiplier = random.uniform(1.30, 1.45)
        elif self._episode_severity == AnomalySeverity.MODERATE:
            # Start in warning, escalate to critical: 1.4x - 1.7x
            multiplier = random.uniform(1.40, 1.70)
        else:  # SEVERE
            # Immediate critical: 1.65x - 1.8x
            multiplier = random.uniform(1.65, 1.80)

        self._episode_target = self.nominal_value * multiplier

    def _generate_episode_reading(self) -> float:
        """Generate a reading within the current anomaly episode."""
        # Add noise around the episode target (fluctuation within the zone)
        noise = random.gauss(0, self.noise_std * 0.5)
        value = self._episode_target + noise

        # For moderate episodes, escalate severity over time
        if self._episode_severity == AnomalySeverity.MODERATE:
            progress = 1.0 - (self._episode_remaining / max(self._episode_remaining + 1, 8))
            # Gradually increase multiplier from warning to critical
            escalation = 1.0 + (progress * 0.15)  # up to 15% escalation
            value = self._episode_target * escalation

        # Clamp to plausible range
        value = max(self.plausible_min, min(value, self.plausible_max))

        return value

    def _end_episode(self) -> None:
        """End the current anomaly episode."""
        self._episode_active = False
        self._episode_remaining = 0
        self._episode_target = 0.0

    def inject_fault(self, mode: FaultMode) -> None:
        """Activate a fault mode (called by QA injection)."""
        self.fault_mode = mode
        if mode == FaultMode.STUCK:
            self._stuck_value = round(self.nominal_value, 1)
        # Clear any active episode when fault is injected
        self._end_episode()

    def clear_fault(self) -> None:
        """Clear fault mode (called after sensor restart)."""
        self.fault_mode = FaultMode.NONE
        self._stuck_value = None
