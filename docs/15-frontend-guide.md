# Frontend Dashboard — Developer Guide

## What is this and why is it the fourth piece built

The frontend is a React SPA with Redux Toolkit for global state. It's the operator's primary interface
to the plant — shows all 15 motors, their real-time sensor data, alerts, and provides controls for
authorized actions (stop, restart, resolve alerts).

It is built fourth because:
- It consumes the backend REST API (spec 02-03) for initial data and auth.
- It connects via WebSocket to receive real-time updates (telemetry, alerts, status changes).
- The backend must be fully functional before the frontend can be validated end-to-end.

## How it works (high level)

```
User logs in → POST /auth/login → stores access token in Redux memory
  → GET /motors (initial snapshot from Redis via REST)
  → Opens WebSocket connection (socket.io)
  → Subscribes to: telemetry, status-change, alert, restart-progress
  → Each WS event dispatches to the corresponding Redux slice
  → Components re-render reactively from the store
```

## State management architecture

All server state lives in Redux. No component maintains duplicate state in `useState`:

| Slice | Contents |
|---|---|
| `authSlice` | user info, role, access token (memory only) |
| `motorsSlice` | dictionary motor_id → {info, status, sensors with ring buffer of ~50 points} |
| `alertsSlice` | active alerts array for the AlertBanner |
| `ragSlice` | conversation history with the RAG assistant |

## The socketMiddleware pattern

A custom Redux middleware manages the WebSocket lifecycle:
- On auth success → opens connection, subscribes to events.
- On each WS event → dispatches the appropriate slice action.
- On disconnect → auto-reconnect + refetch REST snapshot (to cover the gap).
- On logout → closes connection.

This is the ONLY place where WS events become Redux actions. Components never interact with
the socket directly.

## Key views

1. **Grid** (`MotorGrid/MotorCard.tsx`) — 15 cards showing id, location, status badge, last sensor values.
2. **Detail** (`MotorDetail/`) — 3 real-time charts (Recharts), each with independent sensor badge.
3. **Restart countdown** — shown during `restarting` state, fed by `restart-progress` events.
4. **AlertBanner** — real-time notifications when alerts arrive.
5. **RagQueryBox** — natural language queries to the RAG module.

## Role-based UI gating

`ProtectedRoute.tsx` hides/disables controls based on the user's role:
- `viewer`: read-only (no buttons for actions).
- `operator`: can stop/restart motors, resolve alerts.
- `admin`: all of operator + configure thresholds + manage users.

## Tech choices

| Decision | Rationale |
|---|---|
| Redux Toolkit | Explicit global state, required by job position |
| socket.io-client | Matches backend's socket.io gateway |
| Recharts (SVG) | Idiomatic React, easy Redux integration, sufficient for 45 series at 15s intervals |
| Vite | Fast dev server, simple config |

## What this does NOT do

- Does not evaluate thresholds or state (that's the backend's job).
- Does not store tokens in localStorage (access in memory, refresh in httpOnly cookie).
- Does not query MySQL directly (everything goes through the backend API).
