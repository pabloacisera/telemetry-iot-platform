# 29 — Despliegue gratuito en Render (Telemetry v3)

Runbook operativo para desplegar la plataforma en **Render Free** con TiDB Cloud
Starter, MongoDB Atlas M0 y Grafana Cloud. El objetivo es reemplazar la EC2 sin
introducir servicios pagos ni exponer MQTT a Internet.

## Arquitectura

```
Cloudflare DNS (telemetry.artisandevs.site, DNS only)
        │
        ▼
Render Free — un único Docker Web Service
┌──────────────────────────────────────────────┐
│ NestJS :3000  ── sirve React desde /public  │
│ Redis 127.0.0.1:6379  (caché, sin persist.) │
│ Mosquitto 127.0.0.1:1883  (loopback)         │
│ Simulador Python (15 motores, cada 30 s)     │
└──────────────────────────────────────────────┘
        │                         │
        ▼                         ▼
TiDB Cloud Starter          MongoDB Atlas M0
(Prisma, telemetría)        (RAG, embeddings)
        │
        ▼
Grafana Cloud (datasource MySQL → TiDB)
```

El contenedor no ejecuta seeds. Las migraciones se aplican al arrancar con
`prisma migrate deploy`; los seeds y embeddings se ejecutan **una vez** desde una
máquina local contra TiDB/Atlas.

## Prerrequisitos

- Cuenta de Render conectada al repositorio de GitHub.
- TiDB Cloud Starter con base `telemetry_db`.
- MongoDB Atlas M0 con base `rag_knowledge`.
- Grafana Cloud con datasource MySQL apuntando a TiDB.
- Cloudflare administrando `artisandevs.site`.
- `wrangler` disponible vía `npx`.
- Secretos rotados: las credenciales que se hayan pegado en chats o logs deben
  considerarse comprometidas.

## Paso 0 — Rotar secretos

Antes de crear el servicio:

1. Rotar la contraseña de TiDB y actualizar `DATABASE_URL`.
2. Rotar la contraseña del usuario de Atlas y actualizar `MONGO_URI`.
3. Rotar `GROQ_API_KEY` y `RESEND_API_KEY`.
4. No reutilizar `JWT_SECRET` ni contraseñas MQTT de entornos anteriores.

Nunca imprimir valores completos en consola, tickets o commits.

## Paso 1 — TiDB Cloud Starter

1. Crear el cluster Starter en la región más cercana a Render (Oregon).
2. Crear la base `telemetry_db`.
3. Guardar el connection string MySQL con TLS:

```text
mysql://<user>:<password>@<host>:4000/telemetry_db?sslaccept=strict&connection_limit=5&pool_timeout=30
```

4. Configurar Network Access para permitir la IP pública desde la que se
   ejecutarán las migraciones. Para el primer despliegue se puede usar
   temporalmente `0.0.0.0/0`; restringir después si se cuenta con IP fija.
5. Verificar que el usuario tenga permisos de DDL sobre `telemetry_db`.

## Paso 2 — MongoDB Atlas M0

1. Crear el cluster M0.
2. Crear el usuario de base de datos.
3. Permitir `0.0.0.0/0` en Network Access (Render no publica IPs fijas en Free).
4. Usar una URI con base explícita:

```text
mongodb+srv://<user>:<password>@<cluster>/rag_knowledge?retryWrites=true&w=majority
```

5. Verificar que la URI incluya `/rag_knowledge`; sin ese path el seed escribe en
   la base `test`.

## Paso 3 — Grafana Cloud

1. Crear el stack y anotar su URL pública
   (`https://<stack>.grafana.net`).
2. Agregar el datasource MySQL `MySQL-Telemetry` con host, puerto `4000`, base
   `telemetry_db`, usuario y TLS.
3. Importar los dashboards `historical-per-motor` y `alerts-by-severity` desde
   `grafana/provisioning/dashboards/`.
4. Guardar la URL del stack para `VITE_GRAFANA_URL` (solo enlace del frontend;
   no es un endpoint OTLP).

## Paso 4 — Render Blueprint

El repositorio incluye `render.yaml` con el servicio, plan, región, health check
y variables no secretas. Para crearlo:

1. Render Dashboard → **New** → **Blueprint**.
2. Seleccionar el repositorio y la rama `feat/telemetry-v3` (o `main` después
   del merge).
3. Confirmar:
   - Runtime: Docker
   - Dockerfile: `./Dockerfile.render`
   - Context: `.`
   - Plan: Free
   - Región: Oregon
   - Health check: `/api/health`
4. Completar las variables marcadas con `sync: false`:
   - `DATABASE_URL`
   - `MONGO_URI`
   - `GROQ_API_KEY`
   - `RESEND_API_KEY`
5. Render genera automáticamente:
   - `JWT_SECRET`
   - `MQTT_BACKEND_PASS`
   - `MQTT_QA_PASS`
   - `MQTT_ESP32_PASS_PREFIX`
6. Confirmar que `VITE_GRAFANA_URL` sea la URL del stack de Grafana Cloud.

Render traduce las variables de entorno a build args de Docker. Por eso
`VITE_GRAFANA_URL` llega al build de Vite sin pasos adicionales.

### Variables que no van en Render

- `TIDB_*`: solo se usan localmente para construir `DATABASE_URL`.
- `SEED_*`: solo se usan en la ejecución manual de seeds.
- `GRAFANA_ADMIN_PASSWORD`, `GF_SERVER_ROOT_URL`: pertenecen al Grafana
  autoalojado legacy; Grafana Cloud no los necesita.
- `MYSQL_*`: pertenecen a Docker Compose local.

## Paso 5 — Primer deploy

1. Lanzar el deploy y esperar el build multi-stage.
2. Revisar los logs de `start.sh`:
   - password file de Mosquitto generado,
   - Redis y Mosquitto escuchando en loopback,
   - `prisma migrate deploy` sin errores,
   - NestJS healthy en `/api/health`.
3. Abrir la URL `https://<servicio>.onrender.com/api/health`; debe responder:

```json
{ "status": "ok", "timestamp": "..." }
```

4. Abrir la URL raíz; debe cargar el dashboard React.

Si el health check falla, Render no enruta tráfico al servicio. Revisar primero
los logs de migraciones y de Mosquitto.

## Paso 6 — Cloudflare DNS

El dominio debe apuntar a Render **sin proxy** para que el certificado y el
WebSocket funcionen sin capas adicionales:

1. Cloudflare → DNS → `telemetry` → Editar.
2. Tipo `CNAME`.
3. Destino: `<servicio>.onrender.com`.
4. Proxy status: **DNS only** (nube gris).
5. Guardar y esperar la propagación.

Verificar:

```bash
dig +short telemetry.artisandevs.site CNAME
curl -fsS https://telemetry.artisandevs.site/api/health
```

Si Cloudflare queda en modo proxied, Render no puede emitir el certificado del
dominio personalizado y el WebSocket puede fallar.

## Paso 7 — Worker keepalive

Render Free duerme tras ~15 minutos sin tráfico. El Worker de
`cloudflare/keepalive-worker/` hace `GET /api/health` cada 5 minutos.

```bash
cd cloudflare/keepalive-worker
# editar wrangler.toml y reemplazar HEALTH_URL
npx wrangler login
npx wrangler deploy
```

Verificar en Cloudflare → Workers & Pages → `telemetry-keepalive` → Triggers que
el cron `*/5 * * * *` esté activo. La URL del Worker debe devolver
`{"ok":true,...}`.

> **Estado actual:** este Worker **no está desplegado**. Sin él, el servicio
> duerme tras ~15 minutos sin tráfico y el primer request tarda alrededor de un
> minuto.

## Paso 8 — Migraciones y seeds (una sola vez)

No ejecutar seeds desde Render. Usar una máquina local con acceso a TiDB y
Atlas. El entorno runtime debe estar en un archivo con permisos `600`:

```bash
cd /home/kscod/Proyectos/telemetry-system/project/backend
set -a
source /tmp/telemetry-v3.runtime.env
set +a

# Debe apuntar a TiDB, no a MySQL local (no imprime usuario ni contraseña)
node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname + ':' + u.port + u.pathname)"

npx prisma migrate deploy
npx ts-node prisma/seed.ts
npm run seed:embeddings
```

Antes de ejecutar, el runtime env debe contener:

- `DATABASE_URL` de TiDB.
- `MONGO_URI` de Atlas con `/rag_knowledge`.
- `EMBEDDING_MODEL` (default `Xenova/all-MiniLM-L6-v2`).
- `NODE_ENV=production`.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.
- `SEED_OPERATOR_EMAIL`, `SEED_OPERATOR_PASSWORD`.
- `SEED_VIEWER_EMAIL`, `SEED_VIEWER_PASSWORD`.

El seed crea 3 estándares, 15 motores, 45 sensores y 3 usuarios. Es idempotente
para motores/sensores/usuarios, pero reemplaza los embeddings existentes.

## Paso 9 — Smoke tests

1. `GET /api/health` → `200`.
2. Login con el usuario admin sembrado.
3. Dashboard: 15 motores y telemetría nueva cada ~30 s.
4. WebSocket: los valores se actualizan sin recargar.
5. Historial: datos persistentes en TiDB.
6. Grafana: ambos dashboards muestran datos.
7. RAG: una consulta devuelve respuesta con referencias.
8. Landing: el formulario envía el email de bienvenida (Resend).
9. Crear un motor desde la UI y verificar que el simulador lo publica.
10. Reiniciar el servicio Render y confirmar que los 15 motores seed vuelven.

## Limitaciones de Render Free

- **512 MB RAM / 0.1 CPU**: el contenedor incluye Node, Python, Redis y
  Mosquitto. Si hay OOM, reducir `NODE_OPTIONS`, bajar `--maxmemory` de Redis o
  mover el RAG a demanda. El pipeline de embeddings es lazy para no cargar el
  modelo al arrancar.
- **Sin disco persistente**: los motores creados desde la UI y los archivos de
  Mosquitto no sobreviven a un redeploy. Los 15 motores seed sí vuelven desde
  TiDB.
- **Sleep (latencia en frío)**: sin tráfico entrante, Render duerme el servicio
  tras ~15 minutos. El primer request tras la inactividad tarda alrededor de un
  minuto; `/api/health` no evita el sleep porque Render solo sondea instancias que
  ya están corriendo. El Worker de `cloudflare/keepalive-worker/` es opcional y
  **no está desplegado** en este entorno, por lo que el sleep es el comportamiento
  esperado.
- **Sin IP fija**: Atlas debe permitir `0.0.0.0/0` o usar un proxy.
- **Un solo proceso por servicio**: no escalar horizontalmente sin separar el
  simulador y el broker.

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `502` en Render | El contenedor no pasó el health check | Revisar logs de `start.sh`, migraciones y Mosquitto |
| `P1001` en Prisma | TiDB inaccesible o `DATABASE_URL` incorrecta | Revisar host, puerto 4000, TLS y Network Access |
| RAG sin resultados | `MONGO_URI` sin `/rag_knowledge` o seed no ejecutado | Corregir URI y correr `npm run seed:embeddings` |
| MQTT `not authorized` | Password file regenerado o ACL sin el motor | Revisar `start.sh` y recrear el motor |
| DNS no resuelve | CNAME mal cargado o proxy naranja | Dejar DNS only y esperar propagación |
| Worker devuelve `502` | Render dormido o URL incorrecta | Probar `/api/health` directo y revisar `wrangler tail` |
| Email no llega | Dominio no verificado en Resend | Verificar `artisandevs.site` y `RESEND_FROM` |

## Rollback

1. Pausar el Worker keepalive para no consumir ejecuciones.
2. En Cloudflare, volver el CNAME al destino anterior (EC2 o pausar el registro).
3. En Render, suspender el servicio.
4. El código legacy de EC2 sigue en `ansible/` y `docker-compose.yml`; no se
   elimina en esta migración.

No borrar TiDB/Atlas hasta confirmar que no se necesitan los datos.
