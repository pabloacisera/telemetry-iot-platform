# Frontend Architecture (React + Redux Toolkit)

## Slices
- `authSlice`: authenticated user, role, access token in memory (NEVER in localStorage). The refresh token
  is handled via httpOnly + Secure + SameSite=Strict cookie (the frontend never reads it directly, the
  browser sends it automatically to the refresh endpoint).
- `motorsSlice`: dictionary `motor_id -> {info, status, sensors: {temperature, vibration, current}}`,
  with a short ring buffer (last ~50 points) per sensor to feed the charts without requesting history
  from MySQL (that's Grafana's job).
- `alertsSlice`: active alerts, for the `AlertBanner`.
- `ragSlice`: conversation history with the assistant in the current session.

## socketMiddleware — the only translator of WS events to Redux
Upon authentication, opens the WebSocket connection and subscribes to: `telemetry`, `status-change`, `alert`,
`restart-progress`. Each incoming event is translated to a `dispatch(...)` to the corresponding slice. If the
socket reconnects after a drop, it automatically triggers a refetch of `GET /motors` (REST snapshot) to avoid
showing stale data during the disconnection gap.

## Default view: grid → detail
1. **Grid** (`MotorGrid/MotorCard.tsx`): the 15 machines, each card with id, location, motor status badge,
   and last value of its 3 sensors.
2. **Detail** (`MotorDetail/`): on click, 3 `SensorChart.tsx` (Recharts) in real-time, each with its OWN
   status badge (`ok`/`fault`) — so the operator can distinguish if the problem is with the motor or a
   specific sensor (see `04-anomaly-state-machine.md`).
3. During `restarting`, the real countdown is shown fed by the `restart-progress` topic.

## Role-based gating
`routes/ProtectedRoute.tsx` hides/disables: threshold configuration controls (`admin` only), motor
stop/restart buttons (`admin`/`operator` only), user management (`admin` only). `viewer` is read-only.
See the full matrix in `09-roles-permissions.md`.

## Why Recharts and not something else
With ~45 series updating every 15s, Recharts (SVG, idiomatic to React, easy Redux integration) handles it
without issues. If the number of series grew much more, the alternative would be a canvas-based library
(uPlot/ECharts) for performance — documented as a conscious trade-off, not an unconsidered limitation.
