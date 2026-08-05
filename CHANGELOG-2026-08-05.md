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

---

## 3. Modelo de alarmas industriales (reemplaza ventana deslizante 5/8)

### Problema

El modelo anterior usaba una ventana deslizante de 8 lecturas con umbral 5/8 para determinar
si un motor estaba anómalo. Este modelo tenía varias limitaciones:
- No diferenciaba entre una anomalía sostenida y picos aislados.
- El timer de escalación era fijo (2 min) y no configurable por motor.
- No existía recuperación automática si las lecturas se normalizaban.
- No había distinción entre "alarma" y "trip inmediato".

### Causa raíz

El modelo de ventana deslizante fue diseñado en la fase inicial del proyecto pero no
escalaba bien a los requisitos industriales reales (alarmas configurables, gracia para
intervención del operador, trip inmediato en zona crítica).

### Solución

Se reemplazó el modelo de ventana deslizante por un modelo de **lecturas consecutivas +
grace timer + trip inmediato**:

**Modelo nuevo:**
- Cada sensor mantiene un contador de lecturas anómalas consecutivas (en memoria).
- Cuando el contador alcanza `alarmConsecutiveReadings` (configurable por motor), el motor
  entra en estado `alarm`.
- Un grace timer (`alarmGracePeriodMs`, configurable) da tiempo al operador para intervenir.
- Si el timer expira → trip forzado (restart MQTT).
- Una lectura crítica (value > `critical_max`) → trip inmediato sin gracia.
- Si todas las lecturas se normalizan → recuperación automática `alarm` → `healthy`.
- El operador puede resolver la alarma manualmente → cancela el grace timer.

**Archivos modificados:**
- `backend/src/telemetry/motor-evaluation.service.ts` — Reescrito completamente:
  - Contadores consecutivos por sensor (reemplaza ring buffer de 8)
  - Grace timer configurable por motor (reemplaza escalación fija de 2 min)
  - Trip inmediato en zona crítica (sin esperar ventana)
  - Auto-recuperación cuando todos los contadores llegan a 0
  - `setMotorParams()` para hot-reload de parámetros
  - `resolveAlarm()` para resolución manual del operador
- `backend/src/config-module/dto.ts` — Agregados `alarmConsecutiveReadings` y `alarmGracePeriodMs` a `UpdateMotorDto`
- `backend/src/config-module/motor-config.service.ts` — `updateMotor()` ahora persiste y hot-reload parámetros de alarma
- `backend/src/telemetry/telemetry-evaluation.service.ts` — Nuevo método `updateMotorParams()` para hot-reload
- `backend/src/telemetry/motor-evaluation.service.spec.ts` — Reescrito completamente para el nuevo modelo

### Configuración por motor

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `alarmConsecutiveReadings` | INT | 5 | Lecturas consecutivas anómalas para activar ALARMA |
| `alarmGracePeriodMs` | INT | 120000 | Período de gracia en ms antes del trip automático |

### Documentación actualizada

- `docs/04-anomaly-state-machine.md` — Reescrito con nuevo modelo
- `docs/13-backend-guide.md` — Sección de state machine actualizada
- `kiro/steering/01-architecture.md` — Reglas de motor vs sensor actualizadas
- `kiro/steering/05-testing.md` — Edge cases actualizados
- `kiro/specs/02-backend-telemetry-core/` — Requirements, design y tasks actualizados

### Tests

- 73/73 tests del backend pasan (8 test suites)

---

## 4. Comportamiento realista del motor de estados

### Problema

El algoritmo de evaluación era demasiado agresivo: los sensores del simulador generaban
lecturas críticas sueltas (3% de probabilidad, multiplier 1.3-1.8x) que activaban el
trip inmediato sin usar los contadores consecutivos ni el grace timer. Resultado: un motor
se reiniciaba cada ~37 segundos. El operador nunca veía la causa del fallo.

### Causa raíz

El simulador generaba anomalías **independientes por lectura** (cada lectura es i.i.d.),
mientras que el backend esperaba **episodios sostenidos** (contadores consecutivos).
Además, las lecturas con multiplier >1.64x caían en zona crítica → trip inmediato.

### Solución

Se implementó un modelo de comportamiento realista en 4 partes:

#### 1. Simulador: Episodios de anomalía (`simulator/sensor.py`)
- Cada sensor puede entrar en un **episodio** de anomalía sostenida (no spikes sueltos)
- Probabilidad de iniciar episodio: 2% por lectura (motores normales), 10% (motores problemáticos)
- 3 severidades:
  - `mild` (40%): Solo zona warning — motor entra en alarm pero se recupera solo
  - `moderate` (35%): Warning → critical gradual — grace timer da tiempo al operador
  - `severe` (25%): Critical inmediato — trip real
- Duración: 4-12 lecturas (60-180 segundos)
- 15% de chance de recovery prematura por lectura
- 2 motores problemáticos (IDs 5 y 11) con 10% de probabilidad

#### 2. Backend: Cooldown post-reinicio (`motor-evaluation.service.ts`)
- Después de un reinicio, el motor tiene 60s de cooldown donde necesita el doble de
  lecturas consecutivas (2N) para activar alarma
- Esto evita el ciclo trip→restart→trip→restart

#### 3. Backend: Metadata de causa en alertas
- Cada alerta incluye `metadata` JSON con: sensor trigger, valor, umbral, razón
- Campo `metadata` agregado a tabla `alerts` (migración Prisma)
- `StatusTransitionService.createAlert()` acepta metadata opcional

#### 4. Frontend: Causa visible
- `StatusBadge`: nuevo estado `alarm` (naranja)
- `AlertBanner`: muestra "Temperatura · 5 lecturas consecutivas" en el toast
- `MotorCard`: motores en alarm se muestran expandidos
- `MotorGrid`: alarm aparece después de shutting_down en prioridad
- `MotorDetailPage`: botones de stop/restart habilitados en estado alarm

### Archivos modificados

**Simulador:**
- `simulator/sensor.py` — Episodios con severidad (mild/moderate/severe)
- `simulator/config.py` — `anomaly_probability` por motor, `PROBLEMATIC_MOTORS`
- `simulator/motor_simulator.py` — Pass anomaly_probability a sensores

**Backend:**
- `backend/src/telemetry/motor-evaluation.service.ts` — Cooldown + metadata
- `backend/src/telemetry/status-transition.service.ts` — createAlert con metadata
- `backend/prisma/schema.prisma` — Campo `metadata Json?` en Alert
- `backend/prisma/migrations/20260805205817_add_alert_metadata/` — Migración
- `backend/src/telemetry/motor-evaluation.service.spec.ts` — Tests de cooldown y metadata

**Frontend:**
- `frontend/src/components/motors/StatusBadge.tsx` — Estado `alarm`
- `frontend/src/components/motors/MotorCard.tsx` — `alarm` en ATTENTION_STATES
- `frontend/src/components/motors/MotorGrid.tsx` — `alarm` en prioridad
- `frontend/src/components/alerts/AlertBanner.tsx` — Metadata + nuevos tipos
- `frontend/src/pages/MotorDetailPage.tsx` — Botones para estado `alarm`
- `frontend/src/store/alerts.slice.ts` — Interface Alert con metadata
- `frontend/src/store/socket.middleware.ts` — AlertEvent con metadata
- `frontend/src/index.css` — Estilo `alert-toast-cause`

**Documentación:**
- `docs/04-anomaly-state-machine.md` — Cooldown, metadata, tipos de alerta
- `CHANGELOG-2026-08-05.md` — Esta entrada

### Tests

- 78/78 tests del backend pasan (8 test suites, +5 tests nuevos)
- 11/11 tests del simulador pasan
- Frontend compila sin errores TypeScript
