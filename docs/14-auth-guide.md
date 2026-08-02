# Auth & Security — Developer Guide

## What is this and why is it the third piece built

The auth module protects the REST API and WebSocket connections. It's built third because:
- The backend core (spec 02) must exist first — auth wraps around it, not the other way around.
- The frontend (spec 04) needs auth to function — login, token refresh, role-based UI gating.
- Building it before the frontend ensures all endpoints are protected from the start.

## How authentication works

```
User logs in → POST /auth/login (email + password)
  → Server validates credentials (bcrypt compare)
  → Returns: access token (JWT, 15min) in response body
             refresh token (7 days) as httpOnly cookie
  → Frontend stores access token in Redux memory (NEVER localStorage)

Token refresh → POST /auth/refresh (browser sends cookie automatically)
  → Server validates refresh token hash in DB
  → Rotates: old token revoked, new token issued
  → Returns: new access token in body, new refresh cookie

Access token expires → Frontend gets 401 → auto-calls /auth/refresh → retries
```

## Why this specific token strategy

| Decision | Rationale |
|---|---|
| Access in memory | XSS cannot steal it (no localStorage/sessionStorage) |
| Refresh in httpOnly cookie | Browser sends it automatically, JS cannot read it |
| SameSite=Strict | Prevents CSRF (cookie only sent from same origin) |
| Refresh rotation | Stolen token can only be used once; reuse triggers revocation |
| 15min access TTL | Short window of exposure if somehow leaked |
| 7-day refresh TTL | Reasonable session length without re-login |

## How authorization works (role-based)

Three roles: `admin`, `operator`, `viewer`.

Every mutating endpoint has `@Roles(...)` decorator + `RolesGuard`:
```typescript
@Patch(':id/resolve')
@Roles('admin', 'operator')  // viewer cannot resolve alerts
async resolve(...) { ... }
```

The guard reads the role from the JWT payload and rejects with 403 if insufficient.

## Rate limiting

Two levels via `@nestjs/throttler`:
- **Auth routes** (`/auth/login`, `/auth/refresh`): 5 req/min per IP — mitigates brute force.
- **General routes** (everything else): 60 req/min per authenticated user — prevents abuse.

## Threshold validation (why it's in auth spec)

When an admin updates sensor thresholds (`PATCH /sensors/:id`), the server validates that the
new value is within the physically plausible range from `sensor_standards`. This is a security
concern (not just business logic) because accepting impossible values could mask real problems
or trigger false alerts.

## What this does NOT do

- Does not authenticate ESP32 devices (that's Mosquitto ACL, see `docs/03-mqtt-contract.md`).
- Does not implement OAuth2/SSO (not needed for this scope).
- Does not handle WebSocket auth yet (added when the frontend connects in spec 04).
