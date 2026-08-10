# Retención de Datos — Guía del Desarrollador

## Qué hace

El sistema genera miles de readings crudas por hora (15 motores × 3 sensores × ~1 lectura/segundo ≈ 162.000 filas/hora). Sin retención, MySQL se llenaría en pocos días.

El servicio `RetentionService` ejecuta un cron job cada hora que:

1. **Agrega** las readings de la hora anterior en `readings_hourly_agg` (promedio, mínimo, máximo, conteo de anomalías y fallas).
2. **Purga** las readings crudas de más de `RETENTION_DAYS` días (por defecto 7).
3. **Purga** las alertas **resueltas** de más de `ALERT_RETENTION_DAYS` días (por defecto 30). Las alertas activas nunca se tocan.

Además, un segundo cron (minuto :20 de cada hora) ejecuta el **stale alert sweep**: auto-resuelve toda alerta abierta de más de 24h (red de seguridad para motores que nunca se recuperan).

## Flujo de datos

```
Readings crudas (alta frecuencia, retención corta)
  ↓ [cada hora, minuto :05]
readings_hourly_agg (1 fila/sensor/hora, retención permanente)

Readings crudas > 7 días → DELETE
Alertas resueltas > 30 días → DELETE (las activas se conservan)
Alertas abiertas > 24h → auto-resuelta (sweep del minuto :20)
```

## Configuración

| Variable | Default | Descripción |
|---|---|---|
| `RETENTION_DAYS` | 7 | Días que se mantienen las readings crudas antes de purgarlas |
| `ALERT_RETENTION_DAYS` | 30 | Días que se conservan las alertas **resueltas** antes de purgarlas |

## Retención de alertas

Las alertas son el registro de eventos operativos (alarmas, trips, motores deshabilitados).
La tabla crece rápido si hay mucha actividad (el simulador genera cientos por día), por lo
que se purgan las alertas resueltas más viejas que `ALERT_RETENTION_DAYS`:

```sql
DELETE FROM alerts
WHERE resolved_at IS NOT NULL
  AND resolved_at < NOW() - INTERVAL 30 DAY;
```

Reglas:

- **Solo se purgan alertas resueltas** (`resolved_at` no null y anterior al corte). Las
  activas se conservan siempre, sin importar su antigüedad.
- La purga corre dentro del job horario (`retention-job`) y su conteo se loguea como
  `alertsPurged=N`.
- Las alertas **activas** de más de 24h son auto-resueltas por el `stale-alert-sweep`
  (minuto :20), y recién entonces quedan sujetas a la purga de 30 días.

### De-duplicación de alertas

Para evitar que un fallo recurrente genere decenas de filas (p. ej. un motor que trip
repetidamente), `StatusTransitionService.createAlert()` **no crea una alerta nueva si el
motor ya tiene una abierta del mismo tipo** (`motor_alarm`, `motor_trip`, `motor_disabled`,
`sensor_fault`, `sensor_fault_persistent`). La escalación se preserva porque cada tipo
nuevo (`motor_alarm → motor_trip`, `sensor_fault → sensor_fault_persistent`) es distinto y
sí se registra. Resultado: como máximo 1 alerta abierta por motor y tipo.

## Tabla readings_hourly_agg

| Columna | Tipo | Descripción |
|---|---|---|
| motor_sensor_id | int | FK al sensor |
| hour_bucket | datetime | Inicio de la hora (ej: 2026-08-02 14:00:00) |
| avg_value | float | Promedio de la hora |
| min_value | float | Mínimo de la hora |
| max_value | float | Máximo de la hora |
| anomaly_count | int | Cantidad de readings anómalas en esa hora |
| fault_count | int | Cantidad de fallas del sensor en esa hora |

## Tabla retention_job_log

Cada ejecución del job (exitosa o fallida) queda registrada:

| Columna | Descripción |
|---|---|
| run_at | Cuándo corrió |
| status | `ok` o `error` |
| partitions_aggregated | Cuántos sensores se agregaron |
| partitions_dropped | Cuántas readings crudas se eliminaron |
| error | Mensaje de error si falló |

## Observabilidad

Para verificar que el job está corriendo correctamente:

```sql
SELECT * FROM retention_job_log ORDER BY run_at DESC LIMIT 10;
```

Si ves gaps de más de 1 hora entre ejecuciones, el backend estuvo caído.

## Grafana

Las queries de Grafana para tendencias históricas deben usar `readings_hourly_agg` en vez de `readings`. Esto garantiza performance constante sin importar cuántos días de datos existan.

## Idempotencia

El job usa `upsert` para la agregación — si se ejecuta dos veces sobre la misma hora, simplemente actualiza los valores. Es seguro reiniciar el backend sin riesgo de duplicación.

## Para testing

Si querés forzar una ejecución manual del job sin esperar al cron:

```bash
# Desde el backend con ts-node
npx ts-node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  // ... o simplemente esperar a que pase la hora :05
"
```

O bien reducir `RETENTION_DAYS=1` en `.env` para ver purgas más rápido durante testing.
