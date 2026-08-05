# Spec 04 — Design

## Slices
- `authSlice`: user, role, access token in memory (NEVER in localStorage). The refresh token is handled
  via httpOnly + Secure + SameSite=Strict cookie (frontend doesn't read it, browser sends it automatically
  to the refresh endpoint).
- `motorsSlice`: dictionary `motor_id -> {info, status, sensors: {temp, vib, current}}`, plus a short ring
  buffer (last ~50 points) per sensor to feed charts without requesting history from MySQL.
- `alertsSlice`: active alerts, for the `AlertBanner`.
- `ragSlice`: RAG conversation history in the current session.

## Middleware
`socketMiddleware`: upon authentication, opens WS connection, subscribes to events `telemetry`,
`status-change`, `alert`, `restart-progress`, and translates them to `dispatch(motorsSlice.actions...)`.

## Components
`MotorGrid/MotorCard.tsx`, `MotorDetail/SensorChart.tsx` (Recharts), `MotorDetail/StatusBadge.tsx`,
`Alerts/AlertBanner.tsx`, `Rag/RagQueryBox.tsx`, `routes/ProtectedRoute.tsx` (role gating).
