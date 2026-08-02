# Spec 03 — Auth & Security (NestJS)

## Requirements (EARS)
- WHEN a user sends valid credentials to `POST /auth/login`, THE SYSTEM SHALL issue an access token (JWT, 15min)
  and a refresh token (7 days, hashed with bcrypt in `refresh_tokens`, sent as httpOnly cookie).
- WHEN a valid refresh token is used on `POST /auth/refresh`, THE SYSTEM SHALL rotate it: invalidate the
  previous one and issue a new one.
- IF a refresh token that was already used/revoked is reused, THEN THE SYSTEM SHALL reject it and,
  optionally, revoke all active tokens for that user (possible reuse attack).
- IF a mutating endpoint is called without the required role, THEN THE SYSTEM SHALL respond 403.
- IF more than 5 requests/minute arrive at `/auth/login` or `/auth/refresh` from the same IP, THEN THE SYSTEM SHALL respond 429.
- IF more than 60 requests/minute arrive at any other REST route from the same authenticated user, THEN THE SYSTEM SHALL respond 429.
- WHEN an admin updates thresholds of a `motor_sensor`, THE SYSTEM SHALL validate server-side that the new
  value is within the `plausible_min`/`plausible_max` range from `sensor_standards` for that sensor type.

## Acceptance criteria
- No mutating endpoint lacks `RolesGuard`.
- Tokens are never logged in plain text in any application log.
