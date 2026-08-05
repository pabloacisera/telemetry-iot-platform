"""
Persistence for hot-reloaded motors.

Stores dynamically added motor configurations in a CSV file so they
survive simulator restarts. The file is read at startup and updated
whenever a motor is added or removed via hot-reload.
"""

import csv
import logging
import os
from pathlib import Path

from simulator.config import MotorConfig

logger = logging.getLogger(__name__)

# Default path: simulator/data/hot_motors.csv (next to the simulator package)
_DEFAULT_PATH = Path(__file__).parent / "data" / "hot_motors.csv"

FIELDS = ["motor_id", "rated_current_a", "connection_type", "mqtt_user", "mqtt_pass"]


def _get_path() -> Path:
    """Resolve persistence file path (overridable via env var)."""
    env_path = os.getenv("HOT_MOTORS_FILE")
    return Path(env_path) if env_path else _DEFAULT_PATH


def load_hot_motors() -> list[MotorConfig]:
    """Read persisted hot-reload motors from CSV. Returns empty list if file missing."""
    path = _get_path()
    if not path.exists():
        return []

    motors: list[MotorConfig] = []
    try:
        with open(path, "r", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                motors.append(
                    MotorConfig(
                        motor_id=int(row["motor_id"]),
                        rated_current_a=float(row["rated_current_a"]),
                        connection_type=row["connection_type"],
                        mqtt_user=row["mqtt_user"],
                        mqtt_pass=row["mqtt_pass"],
                    )
                )
        logger.info(f"Loaded {len(motors)} hot-reloaded motor(s) from {path}")
    except (ValueError, KeyError, csv.Error) as e:
        logger.error(f"Error reading hot motors file {path}: {e}")
        motors = []

    return motors


def save_motor(config: MotorConfig) -> None:
    """Append a motor to the persistence file (creates file + dir if needed)."""
    path = _get_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    file_exists = path.exists() and path.stat().st_size > 0

    with open(path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow({
            "motor_id": config.motor_id,
            "rated_current_a": config.rated_current_a,
            "connection_type": config.connection_type,
            "mqtt_user": config.mqtt_user,
            "mqtt_pass": config.mqtt_pass,
        })

    logger.info(f"Persisted motor {config.motor_id} to {path}")


def remove_motor(motor_id: int) -> None:
    """Remove a motor from the persistence file."""
    path = _get_path()
    if not path.exists():
        return

    rows: list[dict] = []
    try:
        with open(path, "r", newline="") as f:
            reader = csv.DictReader(f)
            rows = [row for row in reader if int(row["motor_id"]) != motor_id]
    except (ValueError, KeyError, csv.Error) as e:
        logger.error(f"Error reading hot motors file for removal: {e}")
        return

    # Rewrite file without the removed motor
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    logger.info(f"Removed motor {motor_id} from {path}")
