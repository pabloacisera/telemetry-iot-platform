# Spec 04 — Tasks

1. Setup Redux Toolkit store + the 4 slices.
2. `socketMiddleware` with reconnection + snapshot refetch.
3. `MotorGrid` with `MotorCard` (status badge, last values).
4. `MotorDetail` with 3 `SensorChart` (Recharts) + independent per-sensor badges.
5. Restart countdown fed by `restart-progress`.
6. `AlertBanner` with real-time notifications.
7. `RagQueryBox` + handling of the 3 possible responses (healthy data / unreliable sensor / no data).
8. `ProtectedRoute` + control hiding by role.
9. Component tests for key pieces (conditional render by role, status badge).
