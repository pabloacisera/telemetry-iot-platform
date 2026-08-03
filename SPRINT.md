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

4. ~~**Estado en memoria → Redis (riesgo de negocio)**~~ ✅ Implementado: Redis como fuente de verdad única. Lock distribuido por motor. Múltiples instancias pueden evaluar sin conflictos. Timers locales con restore desde Redis. Keyspace notifications documentadas en `docs/23-scaling-guide.md` como siguiente paso.

5. ~~**Refresh token — revocación en cascada**~~ ✅ Implementado: si se detecta reuso de un token revocado, se revocan TODOS los tokens del usuario.

6. ~~**Refresh token — lookup O(n) con bcrypt**~~ ✅ Implementado: campo `jti` con índice único permite lookup O(1). Tokens legacy migran al formato nuevo en el próximo refresh.

---

## Pendientes — Frontend / UX industrial (ISA-101)

7. ~~**Vista compacta tipo semáforo como default**~~ ✅ Cards compactas para sanos (código + badge + timestamp), expandidas para anómalos (valores de sensores visibles).

8. ~~**Paleta de alarma restringida**~~ ✅ Grises para estados normales, saturados solo para alarmas. Iconos por estado (▲ ⚠ ✕) para no depender solo del color.

9. ~~**Timestamp "última actualización" visible por motor**~~ ✅ Muestra "Último dato: hace Xs" en cada card.

10. ~~**Reordenar automáticamente: anómalos arriba, sanos abajo**~~ ✅ Grid ordenado por prioridad de estado.

11. ~~**Sección/link a Grafana**~~ ✅ Botón "📊 Grafana" en el header del dashboard, abre en nueva pestaña.

---

## Pendientes — RAG

12. ~~**Formato de respuestas del RAG**~~ ✅ System prompt actualizado: tablas Markdown para datos numéricos, listas para acciones, negrita para valores críticos.

13. ~~**Renderizar Markdown en el RAG**~~ ✅ Instalado `react-markdown`, mensajes del asistente se renderizan con tablas, listas y formato real.

---

## Notas
- El motor en "under_review" con valores normales no vuelve solo a "Saludable" — falta lógica (punto 1).
- Los embeddings del RAG ya incluyen fragments de estados (20 en MongoDB).
- MySQL tiene ~15K readings tras ~1h de simulación. El cron de retención corrió 1 vez.
- Si el sistema crece (más plantas/motores), el monolito con estado en memoria es el primer cuello de botella, no el broker MQTT.
