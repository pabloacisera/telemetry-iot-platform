"""
QA Fault Injection Script — external tool, NOT part of the production app.

Usage:
  python scripts/inject_fault.py --motor 7 --sensor vibration --fault stuck
  python scripts/inject_fault.py --motor 3 --sensor temperature --fault disconnected
  python scripts/inject_fault.py --motor 12 --sensor current --fault out_of_range

This script connects to the MQTT broker with the qa_fault_injector credentials
and publishes to qa/motor/{id}/inject-fault topics. The simulator subscribes to
these topics and activates the corresponding fault mode.

This script is NEVER accessible from the frontend or the production backend.
"""

import argparse
import json
import os
import sys

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

VALID_SENSORS = ["temperature", "vibration", "current"]
VALID_FAULTS = ["stuck", "out_of_range", "disconnected"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Inject sensor faults for QA testing")
    parser.add_argument("--motor", type=int, required=True, help="Motor ID (1-15)")
    parser.add_argument("--sensor", choices=VALID_SENSORS, required=True, help="Sensor type")
    parser.add_argument("--fault", choices=VALID_FAULTS, required=True, help="Fault mode")
    args = parser.parse_args()

    if not 1 <= args.motor <= 15:
        print("Error: motor must be between 1 and 15")
        sys.exit(1)

    broker_host = os.getenv("MQTT_BROKER_HOST", "localhost")
    broker_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    qa_user = os.getenv("MQTT_QA_USER", "qa_fault_injector")
    qa_pass = os.getenv("MQTT_QA_PASS", "qa_dev_pass")

    client = mqtt.Client(client_id="qa_injector")
    client.username_pw_set(qa_user, qa_pass)

    try:
        client.connect(broker_host, broker_port, keepalive=10)
    except Exception as e:
        print(f"Error connecting to broker: {e}")
        sys.exit(1)

    topic = f"qa/motor/{args.motor}/inject-fault"
    payload = json.dumps({
        "sensor_type": args.sensor,
        "fault_mode": args.fault,
    })

    result = client.publish(topic, payload, qos=1)
    result.wait_for_publish()

    print(f"Fault injected: motor={args.motor}, sensor={args.sensor}, fault={args.fault}")
    print(f"Topic: {topic}")

    client.disconnect()


if __name__ == "__main__":
    main()
