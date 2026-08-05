"""
Motor configuration — defines the 15 simulated motors with their properties.

Each motor has:
- motor_id: unique identifier (1-15)
- rated_current_a: nameplate rated current (used to calculate current thresholds)
- connection_type: wifi or lan (affects reconnection behavior)
- mqtt_user/mqtt_pass: per-device MQTT credentials
- anomaly_probability: chance per reading to start an anomaly episode (default 0.02)

The split between wifi and lan is intentional: motors 1-8 are wifi, motors 9-15 are lan.
This provides realistic diversity for testing both reconnection grace windows (20s vs 5s).
"""

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class MotorConfig:
    """Configuration for a single simulated motor."""

    motor_id: int
    rated_current_a: float
    connection_type: Literal["wifi", "lan"]
    mqtt_user: str
    mqtt_pass: str
    anomaly_probability: float = 0.02  # 2% per reading to start an episode


# Sensor nominal values and ranges (derived from docs/05-thresholds-sources.md)
SENSOR_DEFAULTS = {
    "temperature": {
        "nominal": 55.0,       # typical surface temp for a healthy motor
        "healthy_max": 70.0,
        "noise_std": 3.0,
        "plausible_min": 10.0,
        "plausible_max": 150.0,
    },
    "vibration": {
        "nominal": 1.2,        # typical RMS for Class I motor in good condition
        "healthy_max": 1.8,
        "noise_std": 0.2,
        "plausible_min": 0.0,
        "plausible_max": 20.0,
    },
    "current": {
        # nominal is per-motor (rated_current_a * 0.85 typical load)
        # healthy_max = rated_current_a * 1.05
        "load_factor": 0.85,
        "noise_std_factor": 0.03,  # 3% of rated as noise std
        "plausible_min": 0.0,
        "plausible_max_factor": 3.0,  # 3x rated as physical max
    },
}

# Motors that are "problematic" — higher anomaly probability for demo purposes
PROBLEMATIC_MOTORS = {5, 11}


def build_motors_config(mqtt_pass_prefix: str = "esp32_dev_pass_") -> list[MotorConfig]:
    """Build the list of 15 motor configurations.

    In production, passwords come from environment variables.
    For development, uses predictable passwords matching generate_passwords.py.
    """
    motors: list[MotorConfig] = []

    # Rated currents for 15 motors (realistic range for small/medium industrial motors)
    rated_currents = [
        8.5, 10.0, 12.0, 9.2, 15.0, 11.5, 7.8, 13.0,   # motors 1-8
        14.5, 10.8, 16.0, 9.0, 12.5, 11.0, 8.0,          # motors 9-15
    ]

    for i in range(1, 16):
        # Problematic motors get higher anomaly probability (10%)
        anomaly_prob = 0.10 if i in PROBLEMATIC_MOTORS else 0.02

        motors.append(
            MotorConfig(
                motor_id=i,
                rated_current_a=rated_currents[i - 1],
                connection_type="wifi" if i <= 8 else "lan",
                mqtt_user=f"esp32_motor{i}",
                mqtt_pass=f"{mqtt_pass_prefix}{i}",
                anomaly_probability=anomaly_prob,
            )
        )

    return motors
