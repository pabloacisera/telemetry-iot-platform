#!/bin/ash
set -e

# Preserve upstream behaviour: fix ownership of the persistence volume when
# running as root (the mosquitto process drops privileges to the "mosquitto"
# user on its own).
if [ "$(id -u)" = '0' ]; then
  [ -d /mosquitto/data ] && chown -R mosquitto:mosquitto /mosquitto/data || true
fi

# ---------------------------------------------------------------------------
# Watcher: Mosquitto only reloads password_file/acl_file on SIGHUP. Because the
# broker runs isolated in its own container, no external process can signal it
# without mounting the Docker socket (which is equivalent to root on the host).
# Instead we watch for changes to the two auth files from inside this container
# and send SIGHUP to the broker (PID 1) so new credentials take effect without
# granting the backend any access to the Docker daemon.
# ---------------------------------------------------------------------------
last_pw="$(sha256sum /mosquitto/config/password_file 2>/dev/null || echo missing)"
last_acl="$(sha256sum /mosquitto/config/acl_file 2>/dev/null || echo missing)"

while true; do
  sleep 2
  pw="$(sha256sum /mosquitto/config/password_file 2>/dev/null || echo missing)"
  acl="$(sha256sum /mosquitto/config/acl_file 2>/dev/null || echo missing)"

  if [ "$pw" != "$last_pw" ] || [ "$acl" != "$last_acl" ]; then
    # Debounce: let the write finish before reloading.
    sleep 1
    pw2="$(sha256sum /mosquitto/config/password_file 2>/dev/null || echo missing)"
    acl2="$(sha256sum /mosquitto/config/acl_file 2>/dev/null || echo missing)"
    if [ "$pw2" != "$pw" ] || [ "$acl2" != "$acl" ]; then
      last_pw="$pw2"
      last_acl="$acl2"
      continue
    fi
    kill -HUP 1 2>/dev/null || true
    echo "[watcher] auth files changed - SIGHUP sent to broker"
    last_pw="$pw2"
    last_acl="$acl2"
  fi
done &

# Start the broker as PID 1.
exec "$@"
