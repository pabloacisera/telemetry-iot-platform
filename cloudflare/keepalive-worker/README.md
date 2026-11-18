# Keepalive Worker

Cloudflare Worker opcional que llama a `GET /api/health` del servicio Render cada
5 minutos. Render Free duerme el servicio tras ~15 minutos sin tráfico; este cron
puede mantenerlo despierto sin exponer un endpoint adicional en la aplicación.

> **Estado actual:** este Worker **no está desplegado**. Sin él, telemetry duerme y
> el primer request tras la inactividad tarda alrededor de un minuto. El health
> check de Render no evita el sleep: solo sondea instancias que ya están corriendo.

## Requisitos

- Cuenta de Cloudflare con Workers habilitado.
- URL pública del servicio Render.
- `wrangler` (se usa con `npx`, no hace falta instalarlo globalmente).

## Configuración

Editar `wrangler.toml` y reemplazar el placeholder:

```toml
[vars]
HEALTH_URL = "https://telemetry-iot-platform.onrender.com"
```

El Worker acepta tanto la URL base como la URL completa del health check. Si
recibe la base, agrega `/api/health` automáticamente.

## Deploy

```bash
cd cloudflare/keepalive-worker
npx wrangler login
npx wrangler deploy
```

`wrangler login` abre el navegador para autorizar la cuenta. No pegar API tokens
en el chat ni en el repositorio.

## Verificación

1. En Cloudflare Dashboard → Workers & Pages → `telemetry-keepalive` → Triggers,
   confirmar el cron `*/5 * * * *`.
2. Abrir la URL `workers.dev` del Worker: debe devolver `{"ok":true,...}`.
3. En Render → Logs, confirmar requests a `/api/health` cada 5 minutos.
4. Opcional: `npx wrangler tail` para ver ejecuciones en vivo.

## Costos y límites

- Workers Free incluye cron triggers y ejecuciones diarias suficientes para este
  uso.
- Cada ejecución hace una sola petición HTTP. No se usa caché (`cacheTtl: 0`)
  para que el request llegue realmente a Render.
- Si el Worker devuelve `502`, revisar la URL, el estado del servicio Render y
  sus logs. Un `502` no reinicia Render: solo indica que el health check falló.
