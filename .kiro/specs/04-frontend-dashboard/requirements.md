# Spec 04 — Frontend Dashboard (React + Redux Toolkit)

## Requirements (EARS)
- WHEN the user logs in, THE SYSTEM SHALL load the grid of 15 machines via `GET /motors` (snapshot from
  Redis) and then connect the WebSocket for live updates.
- THE SYSTEM SHALL show on each grid card: motor identification, current status (colored badge), and last
  value of each of its 3 sensors.
- WHEN the user clicks on a machine, THE SYSTEM SHALL navigate to the detail view and show 3 real-time
  charts (one per sensor), each with its own status badge (`ok`/`fault`) independent of the motor's
  general badge.
- WHEN the motor enters `shutting_down` or `restarting`, THE SYSTEM SHALL show the corresponding text
  status and, during `restarting`, a countdown based on the `restart-progress` topic.
- IF the user does not have the `admin` role, THEN THE SYSTEM SHALL hide threshold configuration controls.
- IF the user does not have `admin` or `operator` role, THEN THE SYSTEM SHALL hide motor stop/restart buttons.
- WHEN an alert is received via WebSocket, THE SYSTEM SHALL show an immediate visual notification.
- WHEN the user types a query in the `RagQueryBox`, THE SYSTEM SHALL send it to `POST /rag/query` and
  display the response, including cases where the system indicates missing data or unreliable sensor.

## Acceptance criteria
- Global state lives exclusively in Redux slices; no component maintains duplicate server state in local
  `useState`.
- WebSocket reconnection automatically triggers a REST snapshot refetch (to avoid showing stale data).
