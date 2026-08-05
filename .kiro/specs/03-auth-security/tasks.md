# Spec 03 — Tasks

1. Migrations `users`, `refresh_tokens`.
2. Seed initial admin user.
3. `AuthModule`: login, refresh (with rotation), logout (revokes refresh).
4. `RolesGuard` + `@Roles` decorator.
5. `ThresholdRangeValidator` for the threshold configuration endpoint.
6. `ThrottlerModule` on auth routes (5/min per IP) and general routes (60/min per user).
7. E2E tests: login, refresh, rotation, 403 by role, 429 by rate limit, out-of-physical-range threshold rejected.
