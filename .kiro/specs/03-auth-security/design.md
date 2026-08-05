# Spec 03 — Design

## Tables
`users(id, email, password_hash, role)`, `refresh_tokens(id, user_id, token_hash, expires_at, revoked)`.

## Guards
`JwtAuthGuard` (validates access token), `RolesGuard` (decorator `@Roles('admin')` at method level),
`ThresholdRangeValidator` (custom pipe that queries `sensor_standards` before accepting a threshold PATCH).

## Strategy
Passport + `passport-jwt`. Access token is returned in the login response body (frontend stores it in Redux
memory). Refresh token is sent as httpOnly + Secure + SameSite=Strict cookie (frontend doesn't read it,
the browser sends it automatically to the `/auth/refresh` endpoint).

Refresh rotation: upon using a valid refresh token, it's marked `revoked=true` and a new one is inserted
in the same transaction (prevents race condition from double use).

## Concrete rate limiting
- `ThrottlerModule` with two configurations:
  - Auth: 5 requests/min per IP on `/auth/login` and `/auth/refresh`.
  - General: 60 requests/min per authenticated user on all other routes.
