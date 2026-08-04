# 24 — Módulo de Configuración de Motores

## Descripción

El módulo de configuración permite a usuarios con rol **admin** gestionar motores del sistema. Esto incluye:

- Crear motores (con provisioning automático de credenciales MQTT)
- Editar metadatos de motores (nombre, ubicación, tipo de conexión)
- Eliminar motores (con deprovisioning de MQTT)
- Editar umbrales de sensores por motor

## Arquitectura

```
Frontend (/config)          Backend (NestJS)                Mosquitto
     │                           │                              │
     ├─ POST /config/motors ────►├─ Prisma: create motor ──────►│
     │                           ├─ Prisma: create sensors      │
     │                           ├─ MqttProvisioning:           │
     │                           │   ├─ generate password       │
     │                           │   ├─ hash (PBKDF2-SHA512)    │
     │                           │   ├─ append password_file    │
     │                           │   ├─ append acl_file         │
     │                           │   └─ docker SIGHUP ─────────►│ reload
     │◄── { motor, mqtt creds } ─┤                              │
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/config/motors` | Listar motores con sensores |
| POST | `/config/motors` | Crear motor + provisiong MQTT |
| PATCH | `/config/motors/:id` | Editar motor |
| DELETE | `/config/motors/:id` | Eliminar motor + deprovisiong MQTT |
| PATCH | `/config/motors/:motorId/sensors/:sensorId/thresholds` | Editar umbrales |

Todos los endpoints requieren:
- `JwtAuthGuard` (autenticación)
- `RolesGuard` con `@Roles('admin')` (autorización)

## Flujo de creación de motor

1. Admin completa formulario (código, nombre, ubicación, corriente, tipo conexión).
2. Backend valida con DTOs (class-validator).
3. Se verifica que el código no exista (ConflictException si duplicado).
4. Se crea el motor en MySQL con 3 sensores por defecto:
   - `temperature`: 80 / 100 / 120
   - `vibration`: 4.5 / 7.1 / 11.0
   - `current`: 10 / 14 / 18
5. `MqttProvisioningService` genera:
   - Username: `esp32_motor{id}`
   - Password: 32 bytes aleatorios (base64url)
   - Hash: PBKDF2-SHA512 con 101 iteraciones (formato Mosquitto `$7$...`)
6. Se escribe en `mosquitto/password_file` y `mosquitto/acl_file`.
7. Se envía `SIGHUP` al container `broker-mqtt` para recargar config.
8. Se devuelve la contraseña al frontend (se muestra una sola vez).

## Flujo de eliminación de motor

1. Admin confirma eliminación (prompt en frontend).
2. Backend elimina en transacción:
   - `sensor_faults` del motor
   - `motor_sensors` del motor
   - `alerts` del motor
   - `motor_status_history` del motor
   - `motor` en sí
3. `MqttProvisioningService` remueve entradas de `password_file` y `acl_file`.
4. Se envía `SIGHUP` para recargar Mosquitto.

## Edición de umbrales

- Validación: `healthyMax < warningMax < criticalMax` (ConflictException si no).
- Cambio inmediato: la próxima lectura se evalúa contra los nuevos umbrales.
- No requiere restart del motor ni del broker.

## Seguridad

- Solo usuarios con `role: 'admin'` pueden acceder.
- Frontend usa `RoleGate` para ocultar el botón de configuración.
- Frontend redirige a `/dashboard` si un no-admin navega directo a `/config`.
- Las credenciales MQTT se muestran una única vez; el hash es irreversible.

## Archivos involucrados

### Backend
- `src/config-module/motor-config.module.ts`
- `src/config-module/motor-config.controller.ts`
- `src/config-module/motor-config.service.ts`
- `src/config-module/mqtt-provisioning.service.ts`
- `src/config-module/dto.ts`
- `src/config-module/index.ts`

### Frontend
- `src/pages/ConfigPage.tsx`
- `src/App.tsx` (ruta `/config`)
- `src/pages/DashboardPage.tsx` (botón admin)

### Mosquitto
- `mosquitto/password_file` — usuarios y hashes
- `mosquitto/acl_file` — permisos por topic

## Tests

- `src/config-module/motor-config.service.spec.ts` — 9 tests unitarios del service
- `src/config-module/mqtt-provisioning.service.spec.ts` — 9 tests con archivos temporales

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MOSQUITTO_CONFIG_DIR` | `../mosquitto` (relativo a backend) | Path al directorio de config de Mosquitto |
| `MOSQUITTO_CONTAINER_NAME` | `broker-mqtt` | Nombre del container Docker de Mosquitto |
