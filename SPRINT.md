# Sprint — 2026-08-04

## Completados (sprint anterior — 2026-08-03)

- [x] ERR-001: Pool de conexiones Prisma agotado
- [x] Skeleton de carga al abrir motor
- [x] Formato de hora en charts corregido
- [x] Documentación de troubleshooting
- [x] Optimización de rendimiento (Redis pipeline, auth flow, React.memo)
- [x] Recuperación automática del motor (under_review requiere intervención)
- [x] Escalación automática (timer 2 min → reinicio → disabled)
- [x] Reinicios de sensores (auto-restart 5s, fault_persistent, endpoint manual)
- [x] Estado en memoria → Redis como fuente de verdad
- [x] Refresh token — revocación en cascada
- [x] Refresh token — lookup O(1) con jti
- [x] Vista compacta tipo semáforo (ISA-101)
- [x] Paleta de alarma restringida (grises normales, saturados para alarmas)
- [x] Timestamp "última actualización" por motor
- [x] Reordenar: anómalos arriba, sanos abajo
- [x] Sección/link a Grafana
- [x] Formato de respuestas del RAG (Markdown)
- [x] Renderizar Markdown en el RAG

---

## Pendientes — 2026-08-04

### 1. FontAwesome vía CDN ✅

- CDN kit agregado en `index.html`.
- Iconos Unicode reemplazados por FA en: StatusBadge, AlertBanner, DashboardPage, MotorDetailPage.

---

### 2. Sección de configuración (admin only) — CRUD de motores ✅

**Implementado:**

- **a) CRUD en base de datos (Prisma/MySQL):** ✅
  - Crear motor con código, nombre, ubicación, tipo conexión, corriente nominal, clase aislación.
  - Crear sensores asociados (temperatura, vibración, corriente) con umbrales por defecto.
  - Editar motor (nombre, ubicación, tipo conexión).
  - Editar umbrales por sensor (healthyMax, warningMax, criticalMax) con validación de orden.
  - Eliminar motor (cascada en transacción).

- **b) Autorización en Mosquitto:** ✅
  - Genera usuario MQTT `esp32_motor{N}` con contraseña segura (32 bytes base64url).
  - Hash PBKDF2-SHA512 compatible con Mosquitto.
  - Append a `password_file` y `acl_file` con todos los topics.
  - SIGHUP al container para recargar config.
  - Deprovisiong al eliminar motor.

- **c) Backend (NestJS):** ✅
  - `MotorConfigModule` con controller + service + MQTT provisioning.
  - Endpoints: GET/POST/PATCH/DELETE en `/config/motors`.
  - DTOs con class-validator.
  - RolesGuard (admin only).

- **d) Frontend:** ✅
  - Página `/config` con redirect para no-admin.
  - Formulario de alta con validación.
  - Lista de motores con editar/eliminar.
  - Modal de edición de umbrales.
  - Alerta de credenciales MQTT (se muestra una vez).
  - Botón "Configuración" en dashboard header (admin only con RoleGate).

---

### 3. Rediseño de layout del dashboard ✅

- Grid forzado a 3 columnas (`repeat(3, 1fr)`) con gap 0.75rem.
- Cards compactas (padding 0.75rem, font-size 0.8125rem).
- Contenedor `.dashboard-grid-container` con fondo diferenciado.
- Header con botones fuera del contenedor del grid.
- Animación de pulso (scale 1.02) en cards anómalas.
- AlertBanner convertido en toast flotante (position: fixed, top-right).
- Toasts se acumulan, no salen automáticamente, solo con "✕" manual.

---

### 4. Documentación ✅

- `docs/24-config-module.md` — Módulo completo: endpoints, flujos, seguridad, archivos, variables de entorno.

---

### 5. Tests ✅

- **Backend (Jest):**
  - `motor-config.service.spec.ts` — 9 tests unitarios (CRUD + validaciones).
  - `mqtt-provisioning.service.spec.ts` — 9 tests con archivos temporales (provision/deprovision).
  - Total backend: 68 tests, todos pasan.
- **Frontend (Jest):**
  - `StatusBadge.test.tsx` — 10 tests actualizados para FA + labels español.
  - `RoleGate.test.tsx` — 10 tests (pre-existentes, siguen pasando).
  - Total frontend: 20 tests, todos pasan.

---

## Notas técnicas

- Mosquitto usa `password_file` con hash PBKDF2-SHA512 y `acl_file` estático.
- Script Python existente (`generate_passwords.py`) genera hashes compatibles.
- El backend ya tiene `mqtt` (v5.15.2) como dependencia.
- Testing: Jest 30 configurado en backend, specs existentes en `src/**/*.spec.ts`.
- Frontend: tests en `src/__tests__/` (StatusBadge, RoleGate ya tienen tests).
