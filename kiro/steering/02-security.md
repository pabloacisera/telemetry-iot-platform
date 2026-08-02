# Steering 02 — Security

## User authentication (frontend/operators)
- JWT access token, TTL 15 minutes. Lives in memory (Redux), never in localStorage.
- Refresh token, TTL 7 days, hashed with bcrypt in `refresh_tokens`, mandatory rotation on each use
  (invalidate the previous one when issuing a new one). Sent as httpOnly + Secure + SameSite=Strict cookie.
- Passwords: hashed with bcrypt, never plain text.
- Roles: `admin`, `operator`, `viewer`. See full matrix in `docs/09-roles-permissions.md`.
- `RolesGuard` mandatory on every mutating endpoint.
- Rate limiting (`@nestjs/throttler`):
  - `/auth/login`, `/auth/refresh`: **5 requests/minute per IP** (brute force attack surface).
  - All other REST routes: **60 requests/minute per authenticated user**.

## Device authentication (simulated ESP32) — via Mosquitto, not via JWT
- The backend NEVER authenticates devices with JWT/API Key: ESP32s don't talk to the REST API, they talk
  directly to the MQTT broker.
- Each of the 15 simulated ESP32s has its own username/password in Mosquitto.
- Per-device ACL: each ESP32 can only publish/subscribe to topics of ITS OWN motor_id.
  See the complete contract and ACL table in `docs/03-mqtt-contract.md`.
- The backend has its own MQTT credentials, with broad ACL (all telemetry/status/ack topics, write on all
  command topics).
- Design rationale: although in this demo the broker is isolated in the Docker internal network, the real
  plant topology is modeled (ESP32 in plant, WiFi/LAN connection) where the blast radius of a compromised
  device must be contained to that single motor.
- The broker does NOT use `allow_anonymous` in the demo: the 16 credentials (15 ESP32 + backend) are
  configured even though the network is isolated, so the ACL is the real mechanism being shown and
  explained in the interview.

## Fault injection (QA) — never in the production app
- There is a separate script (`scripts/inject_fault.py`), outside the dashboard and "production" backend.
- Publishes to `qa/motor/{id}/inject-fault` topics, with its own MQTT credentials and ACL restricted only
  to those test topics.
- The simulator subscribes to these topics in addition to normal ones, but ONLY the QA script can publish there.
- A "force fault" button is never added to the operator/admin UI.

## Sensitive variables
- JWT secret, Mongo/MySQL/Redis credentials, MQTT credentials: only via `.env`, never hardcoded or
  versioned in git.
- `.env.example` in the repo with all required keys, without real values.
