# 24 — Módulo de Configuración

## Descripción

El módulo de configuración permite a usuarios con rol **admin** gestionar el sistema desde
la página `/config`. Está dividido en tres tabs, cada una con el mismo contenedor visual
del dashboard (`config-tab-wrapper` = `dashboard-grid-container`) y overflow para listas largas.

---

## Tabs y estructura de UI

### Tab Motores

Lista retráctil de todos los motores, ordenada por prioridad de estado (críticos primero).
Cada fila es colapsable: clic expande los chips de sensor con los umbrales actuales.
Desde ahí se puede editar el motor o sus umbrales individuales.

### Tab Sensores — 3 secciones

**Sección 1 — Umbrales globales por defecto**
Formulario con un card por tipo de sensor (temperatura, vibración, corriente).
Permite editar los valores de referencia del `SensorStandard`. Estos valores se usan
al crear nuevos motores como punto de partida. Modificarlos **no altera** los sensores
de motores ya existentes.

**Sección 2 — Regla personalizada (botón)**
Botón que abre un modal para seleccionar motor + tipo de sensor y asignar umbrales
distintos a los globales. Es el equivalente sensor de `MotorAlertOverride`.

**Sección 3 — Tabla paginada de reglas activas**
Lista todos los sensores de todos los motores que difieran del `SensorStandard`.
Se deriva en frontend cruzando `Motor.sensors` con `SensorStandard`. Paginada a 5 filas.
Desde aquí se puede editar cada regla con el lápiz.

### Tab Alertas — 3 secciones

**Sección 1 — Configuración global**
Formulario con los 4 parámetros de alarma: `alarmConsecutiveReadings`,
`alarmGracePeriodMs`, `postRestartCooldownMs`, `maxAutoRestarts`.
Aplica a todos los motores sin override.

**Sección 2 — Regla personalizada (botón)**
Botón que abre `EditOverrideModal` para crear/editar un override de alertas para un motor.

**Sección 3 — Tabla paginada de reglas activas**
Lista todos los `MotorAlertOverride` existentes. Paginada a 5 filas. Acciones: editar y eliminar.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/config/motors` | Listar motores con sensores |
| POST | `/config/motors` | Crear motor + provisioning MQTT |
| PATCH | `/config/motors/:id` | Editar motor |
| DELETE | `/config/motors/:id` | Eliminar motor + deprovisioning MQTT |
| PATCH | `/config/motors/:motorId/sensors/:sensorId/thresholds` | Editar umbrales de un sensor específico |
| GET | `/config/standards` | Listar sensor standards (valores de referencia globales) |
| PATCH | `/config/standards/:id` | Editar umbrales globales de un tipo de sensor |
| GET | `/config/alerts` | Leer config global de alertas |
| PATCH | `/config/alerts` | Actualizar config global de alertas |
| GET | `/config/alerts/overrides` | Listar overrides por motor |
| POST | `/config/alerts/overrides` | Crear/actualizar override por motor |
| DELETE | `/config/alerts/overrides/:motorId` | Eliminar override (vuelve a config global) |

Todos los endpoints requieren `JwtAuthGuard` + `RolesGuard` con `@Roles('admin')`.

---

## Flujo de creación de motor

1. Admin completa formulario (código, nombre, ubicación, corriente, tipo conexión).
2. Backend valida con DTOs (`class-validator`).
3. Se verifica que el código no exista (`ConflictException` si duplicado).
4. Se crea el motor en MySQL con 3 sensores por defecto tomados de `SensorStandard`
   (temperatura, vibración, corriente). Si la tabla está vacía, usa fallback hardcodeado.
5. `MqttProvisioningService` genera:
   - Username: `esp32_motor{id}`
   - Password: 32 bytes aleatorios (base64url)
   - Hash: PBKDF2-SHA512 con 101 iteraciones (formato Mosquitto `$7$...`)
6. Se escribe en `mosquitto/password_file` y `mosquitto/acl_file`.
7. Se envía `SIGHUP` al container `broker-mqtt` para recargar config.
8. Se devuelve la contraseña al frontend (se muestra una sola vez).

---

## Flujo de edición de sensor standard

1. Admin edita los valores en la Sección 1 de la tab Sensores.
2. `PATCH /config/standards/:id` valida `healthyMax < warningMax < criticalMax`.
3. Se persiste en `sensor_standards` (MySQL).
4. El cambio afecta solo a **nuevos motores** creados después del cambio.
5. Los motores existentes mantienen sus umbrales propios en `motor_sensors`.

---

## Flujo de regla personalizada de sensor

1. Admin pulsa "Regla personalizada" en la Sección 2 de la tab Sensores.
2. Selecciona motor + tipo de sensor en el modal.
3. El modal muestra el `EditThresholdsModal` estándar con los valores actuales del sensor.
4. Al guardar: `PATCH /config/motors/:motorId/sensors/:sensorId/thresholds`.
5. La tabla de la Sección 3 se actualiza automáticamente (derivada de `GET /config/motors`).

---

## Flujo de eliminación de motor

1. Admin confirma eliminación (prompt en frontend).
2. Backend soft-delete en transacción: `motor_sensors`, `motor`.
3. `MqttProvisioningService` remueve entradas de `password_file` y `acl_file`.
4. Se envía `SIGHUP` para recargar Mosquitto.

---

## Seguridad

- Solo usuarios con `role: 'admin'` pueden acceder.
- Frontend usa `RoleGate` para ocultar el botón de configuración en el dashboard.
- Frontend redirige a `/dashboard` si un no-admin navega directo a `/config`.
- Las credenciales MQTT se muestran una única vez; el hash es irreversible.

---

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
- `src/index.css` (clases `.config-tab-wrapper`, `.config-section-block`, etc.)

### Mosquitto
- `mosquitto/password_file` — usuarios y hashes
- `mosquitto/acl_file` — permisos por topic

---

## Tests

- `src/config-module/motor-config.service.spec.ts` — unit tests del service
- `src/config-module/mqtt-provisioning.service.spec.ts` — tests con archivos temporales

---

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MOSQUITTO_CONFIG_DIR` | `../mosquitto` | Path al directorio de config de Mosquitto |
| `MOSQUITTO_CONTAINER_NAME` | `broker-mqtt` | Nombre del container Docker de Mosquitto |
