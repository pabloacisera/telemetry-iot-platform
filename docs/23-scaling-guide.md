# 23 — Guía de Escalado Horizontal

## Estado actual

El backend soporta múltiples instancias concurrentes gracias a:

1. **Redis como fuente de verdad** para el estado de evaluación:
   - Ventanas deslizantes (8 booleans por sensor)
   - Flags de auto-restart (motor y sensor)
   - Stuck trackers (valor + contador por sensor)
   - Timestamps de escalación

2. **Lock distribuido por motor** (`SETNX` con TTL 200ms):
   - Previene que dos instancias evalúen el mismo motor simultáneamente.
   - Si no se obtiene el lock, la lectura se descarta (la siguiente lo intentará).

3. **Operaciones atómicas** en Redis:
   - `pushToWindow`: RPUSH + LTRIM + LRANGE en secuencia (atómico por single-thread de Redis).
   - Flags: GET/SET simples.

## Lo que NO está resuelto (pendiente para multi-instancia real)

### Timers de escalación

Los `setTimeout` son locales al proceso. Si la instancia que creó el timer muere:
- El timer queda registrado en Redis con su timestamp de expiración.
- Cuando una instancia arranca, restaura timers pendientes y los re-programa.
- **Ventana de riesgo:** entre la muerte de una instancia y el arranque de otra, el timer no se ejecuta.

### Solución recomendada: Redis Keyspace Notifications

1. Configurar Redis con `notify-keyspace-events Ex` (notificar expiración de keys).
2. Crear keys con TTL exacto en lugar de `setTimeout`:
   ```
   SET state:escalation:motor:5 "pending" EX 120
   ```
3. Cada instancia se suscribe al canal `__keyevent@0__:expired`.
4. Cuando Redis expira la key, cualquier instancia recibe el evento y ejecuta `checkEscalation`.

**Configuración necesaria en `redis.conf`:**
```
notify-keyspace-events Ex
```

**Código de suscripción (ejemplo):**
```typescript
const sub = new Redis(/* same config */);
sub.subscribe('__keyevent@0__:expired');
sub.on('message', (channel, expiredKey) => {
  const match = expiredKey.match(/state:escalation:(\d+)/);
  if (match) {
    this.checkEscalation(parseInt(match[1], 10));
  }
});
```

### Solución alternativa: Polling

Si no se quiere configurar keyspace notifications:
- Un cron job (cada 10s) revisa Redis por timers vencidos.
- Usa un lock (`SETNX`) para que solo una instancia procese cada timer.
- Más simple, pero con hasta 10s de retraso en la ejecución.

## Requisitos para desplegar N instancias

1. **Load balancer** (Nginx/ALB) distribuyendo requests HTTP al backend.
2. **MQTT:** Cada instancia se conecta con un `clientId` único (ej: `backend_service_{instance_id}`). El broker entrega cada mensaje a un solo subscriber del shared subscription group.
3. **WebSocket:** Sticky sessions o Redis adapter para Socket.IO (`@socket.io/redis-adapter`).
4. **Redis Keyspace Notifications** habilitadas para timers distribuidos.

## Patrón de keys en Redis

| Key | Contenido | TTL |
|-----|-----------|-----|
| `state:window:{sensorId}` | Lista de 0/1 (max 8) | 600s |
| `state:escalation:{motorId}` | timestamp expiración | 180s |
| `state:auto_restart:{motorId}` | "1" | 3600s |
| `state:sensor_auto_restart:{sensorId}` | "1" | 3600s |
| `state:stuck:{sensorId}` | Hash {value, count} | 600s |
| `lock:motor:{motorId}` | "1" | 200ms |
