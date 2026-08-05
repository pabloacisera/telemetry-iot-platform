# Changelog — 2026-08-05

## 1. Persistencia de motores hot-reloaded (simulador)

### Problema

Cuando el simulador se reiniciaba (crash, reinicio de sistema, rebuild de container),
los motores agregados dinámicamente via hot-reload (e.g. motor 16) desaparecían.
Esto causaba que el motor quedara en estado `manual_shutdown` permanente sin posibilidad
de reiniciarlo, ya que no existía un simulador escuchando sus comandos.

### Causa raíz

`build_motors_config()` en `simulator/config.py` solo genera los motores 1–15 (hardcodeados).
Los motores agregados manualmente via `POST /config/motors` se registraban en runtime a
través del mensaje MQTT `system/simulator/motor-added`, pero esta información solo vivía
en memoria — no sobrevivía a reinicios del proceso.

### Solución

Se implementó un módulo de persistencia que almacena motores hot-reloaded en un archivo CSV.

**Archivos creados:**
- `simulator/persistence.py` — módulo con funciones `load_hot_motors()`, `save_motor()`, `remove_motor()`
- `simulator/data/hot_motors.csv` — archivo de persistencia (contiene credenciales MQTT, excluido de git)
- `simulator/data/.gitkeep` — mantiene el directorio en git

**Archivos modificados:**
- `simulator/main.py`:
  - `get_motors()` ahora carga motores del CSV además de los 15 originales
  - `_handle_motor_added()` persiste el motor al CSV al agregarlo
  - `_handle_motor_removed()` lo elimina del CSV al quitarlo
- `docker-compose.yml`: bind mount `./simulator/data:/app/simulator/data` para que
  el CSV sobreviva a rebuilds del contenedor
- `.gitignore`: excluye `simulator/data/hot_motors.csv` (contiene passwords MQTT)

### Formato del CSV

```csv
motor_id,rated_current_a,connection_type,mqtt_user,mqtt_pass
16,8.5,wifi,esp32_motor16,d34G2CxZzXO3YQ1WUdsDxhqpFPEYuzaq
```

### Comportamiento

1. **Al crear motor** (via frontend/API): el backend notifica al simulador via MQTT →
   el simulador inicia el motor Y lo persiste al CSV.
2. **Al eliminar motor**: el backend notifica → el simulador detiene el motor Y lo borra del CSV.
3. **Al reiniciar simulador**: lee los 15 motores base + los del CSV → todos arrancan.

---

## 2. Hot-reload de umbrales en tiempo real (backend)

### Problema

Al modificar los umbrales de un sensor (healthyMax, warningMax, criticalMax) desde la
página de configuración, los valores se guardaban en la base de datos pero el motor de
evaluación en tiempo real seguía usando los valores viejos cacheados en memoria.
Los nuevos umbrales solo se aplicaban tras reiniciar el backend.

### Causa raíz

`TelemetryEvaluationService` carga los umbrales en un `Map<number, SensorMeta>` durante
`onModuleInit()`. El método `updateThresholds()` del `MotorConfigService` solo escribía a
la DB sin notificar al servicio de evaluación.

### Solución

Se agregó un método `updateSensorThresholds()` al `TelemetryEvaluationService` que actualiza
el Map en memoria inmediatamente. El `MotorConfigService.updateThresholds()` ahora lo invoca
después de persistir en la DB.

**Archivos modificados:**
- `backend/src/telemetry/telemetry-evaluation.service.ts`:
  - Nuevo método `updateSensorThresholds(sensorId, { healthyMax?, warningMax?, criticalMax? })`
- `backend/src/config-module/motor-config.service.ts`:
  - Import + inyección de `TelemetryEvaluationService`
  - `updateThresholds()` ahora invoca `updateSensorThresholds()` post-DB write
- `backend/src/config-module/motor-config.service.spec.ts`:
  - Mock de `TelemetryEvaluationService` agregado
  - Assertion de que `updateSensorThresholds` se invoca con los valores correctos
  - Tests pre-existentes de `deleteMotor` y `getAllMotors` corregidos (usaban mocks desactualizados)

### Comportamiento

1. Operador cambia umbrales de vibración del motor 8 en la UI
2. `PATCH /config/motors/8/sensors/22/thresholds` → DB actualizada
3. `updateSensorThresholds(22, { warningMax: 3.5 })` → Map en memoria actualizado
4. La **próxima lectura** del sensor 22 ya se evalúa con el nuevo umbral
5. Alertas, estados y clasificaciones reflejan inmediatamente la nueva configuración

### Tests

- 68/68 tests del backend pasan
- 23/23 tests del simulador pasan
