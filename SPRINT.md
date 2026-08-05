# Sprint — 2026-08-06

## Completados (2026-08-05)

- [x] Modelo de episodios de anomalia (mild/moderate/severe)
- [x] Cooldown post-reinicio (60s, duplica umbral de alarma)
- [x] Metadata en alertas (triggerSensorId, consecutiveReadings, reason)
- [x] Estado `alarm` en frontend (StatusBadge, MotorCard, MotorGrid)
- [x] AlertBanner: causas legibles (sensor + lecturas + razon)
- [x] MotorDetailPage: botones stop/restart habilitados para alarm
- [x] Prisma migration: `metadata Json?` en Alert
- [x] Retained messages en motor-added/motor-removed
- [x] Documentacion SYSTEM-FLOWS.md (guia completa del sistema)

---

## Pendientes — 2026-08-06

### 1. Fix: topics MQTT para multiples motores

**Problema**: MQTT solo guarda 1 retained por topic. Si se crean 2 motores antes de que el simulador arranque, el segundo sobrescribe al primero y se pierde el motor 16.

**Solucion**:
- Backend: cambiar topic de `system/simulator/motor-added` a `system/simulator/motor-added/{motorId}`
- Backend: cambiar topic de `system/simulator/motor-removed` a `system/simulator/motor-removed/{motorId}`
- Simulator: parsear motorId del topic en lugar del payload
- Simulator: limpiar retained del topic especifico

**Archivos**:
- `backend/src/command/command.service.ts` (lineas 122-135)
- `simulator/main.py` (lineas 142-158)

**Validacion**: `npx tsc --noEmit` + `npx jest --no-coverage` + `pytest`

---

### 2. Documentacion de hot-reload + retained messages

**Pendiente**: Actualizar `docs/24-config-module.md` con:
- Flujo de hot-reload del simulador
- Diagrama de retained messages
- Explicacion de topics por motor
- Limitacion de MQTT retained (1 por topic)

---

### 3. Verificacion general

- Correr todos los tests del backend (78+)
- Verificar que no haya regresiones en el frontend
- Probar manualmente: crear motor desde config, verificar que simulador lo recibe
