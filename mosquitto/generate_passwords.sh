#!/bin/bash
# Generate Mosquitto password file for development
# In production, passwords come from .env and are generated during deployment
# This script requires mosquitto_passwd to be available (installed with mosquitto-clients)

PASSWORD_FILE="./password_file"

# Remove existing file
rm -f "$PASSWORD_FILE"

# ESP32 devices (15 motors)
for i in $(seq 1 15); do
  mosquitto_passwd -b "$PASSWORD_FILE" "esp32_motor${i}" "esp32_dev_pass_${i}"
done

# Backend service
mosquitto_passwd -b "$PASSWORD_FILE" "backend_service" "backend_dev_pass"

# QA fault injector
mosquitto_passwd -b "$PASSWORD_FILE" "qa_fault_injector" "qa_dev_pass"

echo "Password file generated at $PASSWORD_FILE with 17 users (15 ESP32 + backend + qa)"
