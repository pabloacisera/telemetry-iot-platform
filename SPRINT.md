# Sprint — 2026-08-03 (tarde)

## Completados hoy (mañana)

- [x] **ERR-001: Pool de conexiones Prisma agotado** — Buffer de escrituras con `createMany` + pool ampliado a 20 conexiones.
- [x] **Skeleton de carga al abrir motor** — Placeholders animados mientras cargan los charts.
- [x] **Formato de hora en charts corregido** — HH:MM:SS completo sin rotación.
- [x] **Documentación de troubleshooting** — `docs/22-troubleshooting.md` con 10 errores históricos.
- [x] **Optimización de rendimiento** — Redis pipeline, auth flow, React.memo, StrictMode removido.

---

## Pendientes — Backend / Lógica de negocio

1. ~~**Recuperación automática del motor**~~ ✅ Verificado: el estándar industrial es que `under_review` no vuelve solo a `healthy` — requiere intervención del operador. Ya implementado correctamente.

2. ~~**Escalación automática**~~ ✅ Verificado: timer de 2 minutos funciona (`startEscalationTimer`). Si sigue anómalo → reinicio forzado. Si ya se reinició una vez → `disabled`.

3. ~~**Reinicios de sensores**~~ ✅ Implementado: auto-restart a los 5s, si recurre → `fault_persistent`. Alerta creada en ambos casos. Endpoint manual: `POST /motors/:id/sensors/:sensorId/restart`.

4. ~~**Estado en memoria → Redis (riesgo de negocio)**~~ ✅ Implementado: windows, escalation timers, auto-restart flags y stuck trackers se persisten en Redis con write-through. Al reiniciar el proceso, se restauran automáticamente.

5. ~~**Refresh token — revocación en cascada**~~ ✅ Implementado: si se detecta reuso de un token revocado, se revocan TODOS los tokens del usuario.

6. ~~**Refresh token — lookup O(n) con bcrypt**~~ ✅ Implementado: campo `jti` con índice único permite lookup O(1). Tokens legacy migran al formato nuevo en el próximo refresh.

---

## Pendientes — Frontend / UX industrial (ISA-101)

7. **Vista compacta tipo semáforo como default**
   - Motores sanos: colapsados, grises, chicos.
   - Motores anómalos: expandidos, arriba, con color de alarma.
   - Cards grandes solo en detalle (ya existe MotorDetailPage).

8. **Paleta de alarma restringida**
   - Grises para estado normal.
   - Rojo/naranja/amarillo saturados SOLO para alarmas reales.
   - Separar colores de acento de UI de los de alarma.

9. **Timestamp "última actualización" visible por motor**
   - Evitar que el operador confíe en un dato congelado.
   - Mostrar "hace X seg" en cada card.

10. **Reordenar automáticamente: anómalos arriba, sanos abajo**
    - Prioridad visual por excepción, no por inventario.

11. **Sección/link a Grafana**
    - Botón o link directo a `localhost:4002` desde el dashboard.

---

## Pendientes — RAG

12. **Formato de respuestas del RAG**
    - Responder con tablas/listas cuando haya comparación temporal o datos numéricos.
    - Comportamiento estándar (no solo cuando el operario lo pida).

13. **Renderizar Markdown en el RAG**
    - Tablas/listas del LLM se vean como tablas reales en la UI.

---

## Notas
- El motor en "under_review" con valores normales no vuelve solo a "Saludable" — falta lógica (punto 1).
- Los embeddings del RAG ya incluyen fragments de estados (20 en MongoDB).
- MySQL tiene ~15K readings tras ~1h de simulación. El cron de retención corrió 1 vez.
- Si el sistema crece (más plantas/motores), el monolito con estado en memoria es el primer cuello de botella, no el broker MQTT.
