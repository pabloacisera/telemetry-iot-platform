"""
Generate Mosquitto password file in PBKDF2-SHA512 format.
This avoids requiring mosquitto_passwd to be installed locally.
Run: python mosquitto/generate_passwords.py
"""

import hashlib
import base64
import os


def generate_mosquitto_hash(password: str) -> str:
    """Generate a Mosquitto-compatible PBKDF2-SHA512 password hash."""
    iterations = 101
    salt = os.urandom(12)
    dk = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, iterations)
    # Mosquitto format: $7$<iterations>$<base64_salt>$<base64_hash>
    salt_b64 = base64.b64encode(salt).decode()
    dk_b64 = base64.b64encode(dk).decode()
    return f"$7${iterations}${salt_b64}${dk_b64}"


def main() -> None:
    users: dict[str, str] = {}

    # 15 ESP32 devices
    for i in range(1, 16):
        users[f"esp32_motor{i}"] = f"esp32_dev_pass_{i}"

    # Backend service
    users["backend_service"] = "backend_dev_pass"

    # QA fault injector
    users["qa_fault_injector"] = "qa_dev_pass"

    output_path = os.path.join(os.path.dirname(__file__), "password_file")
    with open(output_path, "w") as f:
        for username, password in users.items():
            hashed = generate_mosquitto_hash(password)
            f.write(f"{username}:{hashed}\n")

    print(f"Generated {output_path} with {len(users)} users (15 ESP32 + backend + qa)")


if __name__ == "__main__":
    main()
