# Sprint — 2026-08-03

## Pendientes para hoy

1. **Recuperación automática del motor**
   - Si la ventana deslizante se normaliza (<5/8 anómalas), ¿vuelve a "Saludable" sin intervención humana?
   - Investigar si es estándar industrial o requiere confirmación de operador.

2. **Escalación automática**
   - Verificar que el timer de 2 minutos funciona correctamente.
   - Si sigue anómalo después de 2 min → reinicio forzado (100s).

3. **Reinicios de sensores**
   - Verificar que sensores en falla se reinician automáticamente (5s).
   - Si recurre → `fault_persistent`. Verificar la UI para esto.

4. **Sección/link a Grafana**
   - Acceso manual desde el dashboard (botón o link directo a `localhost:4002`).

5. **Formato de respuestas del RAG**
   - Cuando la consulta implique comparación temporal o datos numéricos, responder con tablas/listas formateadas.
   - Hacerlo comportamiento estándar (no solo cuando el operario lo pida).

6. **Renderizar Markdown en el RAG**
   - Para que las tablas/listas del LLM se vean como tablas reales en la UI (no texto plano MD).

## Notas
- El motor que está en revisión con valores actuales normales no vuelve solo a "Saludable" — falta implementar esa lógica.
- Los embeddings del RAG ya incluyen los fragments de estados (20 en MongoDB).
- MySQL tiene ~15K readings tras ~1h de simulación. El cron de retención corrió 1 vez.
