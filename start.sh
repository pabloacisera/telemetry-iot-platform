#!/usr/bin/env bash
set -Eeuo pipefail

log() { printf '[start] %s\n' "$*"; }
die() { printf '[start] ERROR: %s\n' "$*" >&2; exit 1; }

export NODE_ENV="${NODE_ENV:-production}"
export REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export MQTT_BROKER_HOST="${MQTT_BROKER_HOST:-127.0.0.1}"
export MQTT_BROKER_PORT="${MQTT_BROKER_PORT:-1883}"
export MOSQUITTO_CONFIG_DIR="${MOSQUITTO_CONFIG_DIR:-/mosquitto/config}"
export HOT_MOTORS_FILE="${HOT_MOTORS_FILE:-/tmp/hot_motors.csv}"
export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-/app/.cache/transformers}"
export MQTT_BACKEND_USER="${MQTT_BACKEND_USER:-backend_service}"
export MQTT_BACKEND_PASS="${MQTT_BACKEND_PASS:-backend_dev_pass}"
export MQTT_QA_USER="${MQTT_QA_USER:-qa_fault_injector}"
export MQTT_QA_PASS="${MQTT_QA_PASS:-qa_dev_pass}"
export MQTT_ESP32_PASS_PREFIX="${MQTT_ESP32_PASS_PREFIX:-esp32_dev_pass_}"

mkdir -p /mosquitto/data "$MOSQUITTO_CONFIG_DIR" /tmp/telemetry "$TRANSFORMERS_CACHE" /app/.cache

# Generate Mosquitto's password file from runtime secrets. The static ACL file is
# copied into the image; the backend can still append dynamic motor entries.
/app/venv/bin/python - <<'PY'
import base64
import hashlib
import os

prefix = os.environ.get("MQTT_ESP32_PASS_PREFIX", "esp32_dev_pass_")
users = {f"esp32_motor{i}": f"{prefix}{i}" for i in range(1, 16)}
users[os.environ.get("MQTT_BACKEND_USER", "backend_service")] = os.environ.get(
    "MQTT_BACKEND_PASS", "backend_dev_pass"
)
users[os.environ.get("MQTT_QA_USER", "qa_fault_injector")] = os.environ.get(
    "MQTT_QA_PASS", "qa_dev_pass"
)

def mosquitto_hash(password: str) -> str:
    iterations = 101
    salt = os.urandom(12)
    digest = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, iterations)
    return (
        f"$7${iterations}$"
        f"{base64.b64encode(salt).decode()}$"
        f"{base64.b64encode(digest).decode()}"
    )

path = "/mosquitto/config/password_file"
with open(path, "w", encoding="utf-8") as handle:
    for username, password in users.items():
        handle.write(f"{username}:{mosquitto_hash(password)}\n")
os.chmod(path, 0o600)
print(f"[start] generated {path} with {len(users)} users")
PY

# The Debian mosquitto package drops privileges to the mosquitto user. It must
# be able to read the generated password file and write persistence data.
chown mosquitto:mosquitto "$MOSQUITTO_CONFIG_DIR/password_file" /mosquitto/data

[ -s "$MOSQUITTO_CONFIG_DIR/acl_file" ] || die "missing $MOSQUITTO_CONFIG_DIR/acl_file"

# ---------------------------------------------------------------------------
# Redis: local cache only, no persistence, bounded memory.
# ---------------------------------------------------------------------------
redis-server \
  --bind 127.0.0.1 \
  --port "$REDIS_PORT" \
  --save "" \
  --appendonly no \
  --maxmemory 80mb \
  --maxmemory-policy allkeys-lru &
REDIS_PID=$!

# ---------------------------------------------------------------------------
# Mosquitto: local broker.
# ---------------------------------------------------------------------------
mosquitto -c "$MOSQUITTO_CONFIG_DIR/mosquitto.conf" &
MOSQUITTO_PID=$!

# ---------------------------------------------------------------------------
# Auth-file watcher: the backend updates password_file/acl_file when a dynamic
# motor is created. Mosquitto reloads them on SIGHUP.
# ---------------------------------------------------------------------------
watch_auth_files() {
  local last_pw last_acl
  last_pw="$(sha256sum "$MOSQUITTO_CONFIG_DIR/password_file" 2>/dev/null || echo missing)"
  last_acl="$(sha256sum "$MOSQUITTO_CONFIG_DIR/acl_file" 2>/dev/null || echo missing)"

  while true; do
    sleep 2
    local pw acl
    pw="$(sha256sum "$MOSQUITTO_CONFIG_DIR/password_file" 2>/dev/null || echo missing)"
    acl="$(sha256sum "$MOSQUITTO_CONFIG_DIR/acl_file" 2>/dev/null || echo missing)"

    if [ "$pw" != "$last_pw" ] || [ "$acl" != "$last_acl" ]; then
      sleep 1
      local pw2 acl2
      pw2="$(sha256sum "$MOSQUITTO_CONFIG_DIR/password_file" 2>/dev/null || echo missing)"
      acl2="$(sha256sum "$MOSQUITTO_CONFIG_DIR/acl_file" 2>/dev/null || echo missing)"
      if [ "$pw2" != "$pw" ] || [ "$acl2" != "$acl" ]; then
        last_pw="$pw2"
        last_acl="$acl2"
        continue
      fi
      if kill -0 "$MOSQUITTO_PID" 2>/dev/null; then
        kill -HUP "$MOSQUITTO_PID" 2>/dev/null || true
        log "Mosquitto auth files changed; SIGHUP sent"
      fi
      last_pw="$pw2"
      last_acl="$acl2"
    fi
  done
}
watch_auth_files &
WATCHER_PID=$!

# ---------------------------------------------------------------------------
# Wait for infrastructure.
# ---------------------------------------------------------------------------
for _ in $(seq 1 30); do
  if redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping >/dev/null 2>&1 || die "Redis did not start"

for _ in $(seq 1 30); do
  if mosquitto_sub \
    -h 127.0.0.1 \
    -p "$MQTT_BROKER_PORT" \
    -t '$SYS/broker/uptime' \
    -C 1 \
    -W 3 \
    -u "$MQTT_BACKEND_USER" \
    -P "$MQTT_BACKEND_PASS" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
mosquitto_sub \
  -h 127.0.0.1 \
  -p "$MQTT_BROKER_PORT" \
  -t '$SYS/broker/uptime' \
  -C 1 \
  -W 3 \
  -u "$MQTT_BACKEND_USER" \
  -P "$MQTT_BACKEND_PASS" >/dev/null 2>&1 || die "Mosquitto did not start"

# ---------------------------------------------------------------------------
# Database migrations (idempotent).
# ---------------------------------------------------------------------------
log "Applying Prisma migrations..."
npx prisma migrate deploy

# ---------------------------------------------------------------------------
# NestJS.
# ---------------------------------------------------------------------------
log "Starting NestJS..."
node dist/main.js &
BACKEND_PID=$!

HEALTH_URL="http://127.0.0.1:${PORT:-3000}/api/health"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    log "Backend healthy at $HEALTH_URL"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    die "Backend exited before becoming healthy"
  fi
  sleep 1
done
curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 || die "Backend health check failed"

# ---------------------------------------------------------------------------
# Simulator.
# ---------------------------------------------------------------------------
log "Starting simulator..."
(cd /app && /app/venv/bin/python -m simulator.main) &
SIMULATOR_PID=$!

CLEANED=0
cleanup() {
  if [ "$CLEANED" = "1" ]; then
    return
  fi
  CLEANED=1
  log "Shutting down..."
  kill "$SIMULATOR_PID" "$BACKEND_PID" "$WATCHER_PID" "$MOSQUITTO_PID" "$REDIS_PID" 2>/dev/null || true
  wait "$SIMULATOR_PID" "$BACKEND_PID" "$WATCHER_PID" "$MOSQUITTO_PID" "$REDIS_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# ---------------------------------------------------------------------------
# Supervise critical processes. If any dies, exit non-zero so Render restarts
# the whole container instead of leaving it half-alive.
# ---------------------------------------------------------------------------
while true; do
  if ! kill -0 "$REDIS_PID" 2>/dev/null; then
    die "Redis exited"
  fi
  if ! kill -0 "$MOSQUITTO_PID" 2>/dev/null; then
    die "Mosquitto exited"
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    die "Backend exited"
  fi
  if ! kill -0 "$SIMULATOR_PID" 2>/dev/null; then
    die "Simulator exited"
  fi
  sleep 5
done
