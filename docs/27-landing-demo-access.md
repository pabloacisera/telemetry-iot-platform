# Landing / Demo Access (self-service signup)

> Endpoint público `POST /landing/subscribe`. Crea un usuario de demo a partir de un
> correo enviado desde la landing pública y entrega las credenciales por email (Resend).

## Why it exists

The public landing (`/`) lets a prospect request access to a demo by submitting their
email. Previously that only recorded a "lead" in Redis; now it also creates a real user
so the prospect can log in immediately. The temporary password is delivered by email so
no password ever crosses the API or the logs.

## Flow

1. Visitor submits their email in the "Solicitar acceso" section of the landing.
2. `LandingService.subscribe()` normalizes the email (`trim().toLowerCase()`).
3. If a user already exists with that email → `409 Conflict` ("Ya existe una cuenta con
   este correo"); nothing is created or sent.
4. If `RESEND_API_KEY` is not set → `503 Service Unavailable`; the user is NOT created
   (avoids orphan accounts that can never receive credentials).
5. A temporary password is generated: 8 chars, alphanumeric, at least one uppercase and
   one lowercase, no ambiguous characters (`0/O`, `1/l/I`), sourced from `crypto.randomBytes`.
6. `bcrypt.hash(password, 10)` → `users` row created with `role` from `LANDING_DEMO_ROLE`.
7. The lead is audited in Redis (`SADD landing:leads <email>`) — non-fatal if Redis is down.
8. `EmailService.sendWelcomeEmail()` sends the welcome email with **Correo / Usuario /
   Contraseña**, a spam warning and an "Ingresar a la plataforma" CTA pointing to
   `LANDING_APP_URL`.

The password is never logged and never present in any API response. The new user logs in
through the normal `POST /auth/login` with email + password.

## API

`POST /landing/subscribe` — public (no auth)

| Status | Case | Body |
| --- | --- | --- |
| `201` | Access created | `{ granted: true, email }` |
| `400` | Invalid email (`@IsEmail`, `@MaxLength(254)`) | NestJS validation message |
| `409` | Email already registered | `{ message: "Ya existe una cuenta con este correo" }` |
| `503` | `RESEND_API_KEY` not configured | `{ message: "El servicio de correo no está configurado" }` |

## Files

- `backend/src/landing/landing.module.ts` — module wiring (`LandingService`, `EmailService`).
- `backend/src/landing/landing.controller.ts` — `POST /landing/subscribe`.
- `backend/src/landing/landing.service.ts` — signup flow + `generateTemporaryPassword()`.
- `backend/src/landing/email.service.ts` — `EmailService` (Resend) + inline HTML template.
- `backend/src/landing/dto.ts` — `SubscribeDto` validation.
- `frontend/src/pages/LandingPage.tsx` — "Solicitar acceso" form, success state with spam
  hint, and a specific message on `409`.

## Configuration (env)

| Variable | Default | Description |
| --- | --- | --- |
| `RESEND_API_KEY` | *(empty → emails disabled)* | Resend API key (https://resend.com) |
| `RESEND_FROM` | `onboarding@resend.dev` | Sender. Sandbox only delivers to your verified email; use a verified domain in production. |
| `LANDING_DEMO_ROLE` | `viewer` | Role for created accounts: `viewer \| operator \| admin` |
| `LANDING_APP_URL` | `http://localhost:5173` | Base URL of the "Ingresar" CTA in the email |

## Notes

- **Resend sandbox**: with `onboarding@resend.dev` the email is only delivered to the
  address verified in the Resend account. For delivery to any recipient, verify a domain
  and set `RESEND_FROM` accordingly.
- **Rate limiting**: this endpoint is public and creates accounts. The project's
  `ThrottlerModule` does not apply a global guard yet, so adding throttling to
  `/landing/subscribe` is recommended before public exposure.
- **RAG/Kiro**: intentionally NOT included in the RAG knowledge base — the assistant
  answers platform/plant operation questions, not account flows.
