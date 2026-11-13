# Runbook: Primer despliegue en la EC2

Cómo se divide el trabajo:

| Etapa | Quién | Qué |
|---|---|---|
| 1. Infraestructura global | Manual (1 vez) | Docker, Compose, cloudflared, túnel, `nginx-global` en `/opt/infra` |
| 2. Desplegar la app | Ansible | Proyecto + `.env` + `docker compose up` (con su propio nginx) + conectar red a nginx-global + conf global + subdominio en el túnel |
| 3. Post-deploy | Manual (1 vez) | Seeds de usuarios/motores y de RAG + smoke test |

Arquitectura objetivo:

```
Cloudflare → túnel cloudflared → :80 nginx-global (rutea SOLO por subdominio)
                                        ├── sistema1.artisandevs.site → /opt/apps/sistema1/ → su nginx → backend/db internos
                                        ├── sistema2.artisandevs.site → /opt/apps/sistema2/ → su nginx → backend/db internos
                                        └── artisandevs.site          → /opt/apps/landing/  → su nginx → ...
```

- El nginx-global es "tonto": **no conoce** los servicios internos de cada app. Solo
  redirige `server_name` → `http://<app>-nginx:80`.
- Cada app vive en `/opt/apps/<app>/` y es **autocontenida**: su propio `nginx`
  (contenedor `<app>-nginx`), su red `<app>-net` (la crea `docker compose`) y su
  `docker-compose.yml` con frontend/backend/DB en red interna. El routing interno
  (`/`, `/api`, `/socket.io`, `/grafana`) lo hace el nginx de la app.

---

## Antes de empezar (máquina local)

Ansible vive en un venv (no toca el sistema):

```bash
source ~/.venvs/ansible/bin/activate   # luego los comandos van con ansible-playbook directo
```

Inventario y key (ya configurados y verificados):
- `ansible/inventory.ini` → `13.59.198.49`, usuario `ec2-user`, key `~/.ssh/IOT-engine-access-key.pem`.
- Credenciales de app: `ansible/files/.env.production` (ya completo: GROQ, JWT, RESEND/LANDING, MYSQL, MQTT).
  > ⚠️ **Está en `.gitignore` (local-only)** — el archivo debe existir en esta máquina
  > (no viaja en git). El playbook falla con un mensaje claro si no está.

---

## Etapa 1 — Infraestructura global (a mano, una sola vez en la EC2)

> Estado actual de la instancia `13.59.198.49` (Amazon Linux 2023): ya está todo hecho.
> Este es el registro de lo realizado, por si hay que reproducirlo en otra instancia.

1. **Docker + Docker Compose v2** instalados y `ec2-user` en el grupo `docker`.
   - Docker: `sudo dnf install -y docker && sudo systemctl enable --now docker`
   - Compose v2 (AL2023 no trae paquete): binario en `/usr/local/lib/docker/cli-plugins/docker-compose`.
2. **cloudflared** instalado como **binario** (repo oficial: `sudo dnf config-manager --add-repo
   https://pkg.cloudflare.com/cloudflared-ascii.repo && sudo dnf install -y cloudflared`).
   Corre como **systemd service**, no como contenedor: así el túnel sobrevive a
   reinicios de Docker y el ingress `http://localhost:80` funciona directo.
3. **`cloudflared tunnel login`** hecho (auth por navegador) → `~/.cloudflared/cert.pem`.
4. **Carpetas**: `/opt/infra/conf.d/` (nginx-global) y `/opt/apps/` (una carpeta por app).
5. **nginx-global** corriendo en `/opt/infra` (imagen `nginx:alpine`, puerto `80:80`,
   `conf.d/` montado, `default.conf` catch-all 404). Verificar:
   ```bash
   docker ps                                   # nginx-global Up
   curl -s http://localhost                     # → {"error":"aplicacion no encontrada"}
   ```
6. **Túnel creado y corriendo** (`cloudflared tunnel create <tunnel>` + systemd).
   El `config.yml` enruta **todo** a `http://localhost:80` — el nginx-global decide
   a qué app va según el `Host`.

> ⚠️ **No** crear los `.conf` por app a mano ni el subdominio en el túnel: los
> escribe Ansible en la Etapa 2. La red `telemetry-net` tampoco se crea a mano
> (la crea `docker compose`).

---

## Etapa 2 — Desplegar la app (Ansible, un solo comando)

```bash
cd /home/kscod/Escritorio/telemetry-system/project/ansible
source ~/.venvs/ansible/bin/activate
ansible-playbook playbook.yml -i inventory.ini -e "tunnel_name=<nombre-del-tunel>"
```

El playbook (idempotente, se puede repetir):
1. Copia el proyecto a `/opt/apps/telemetry/`.
2. Copia el `.env` (desde `ansible/files/.env.production`).
3. `docker compose up -d --build` — levanta 9 servicios, incluido **`telemetry-nginx`**
   (el nginx de la app, que rutea `/`, `/api/`, `/socket.io/` y `/grafana/` hacia los
   contenedores internos). `docker compose` crea `telemetry-net`.
4. Conecta `telemetry-net` a `nginx-global` (para que el global resuelva `telemetry-nginx`).
5. Registra `telemetry.artisandevs.site` en el túnel (`cloudflared tunnel route dns`).
6. Copia `files/nginx/telemetry.conf` (conf global **mínimo**: subdominio → `telemetry-nginx:80`)
   a `/opt/infra/conf.d/telemetry.conf`.
7. Valida y recarga nginx global (nunca lo reinicia).

Al terminar: `https://telemetry.artisandevs.site` debe servir la landing.

> Para apps nuevas se usa el playbook genérico:
> ```bash
> ansible-playbook deploy-app.yml -i inventory.ini \
>   -e "app_name=mi-app" -e "app_subdomains=mi-app.artisandevs.site" -e "tunnel_name=<tunnel>"
> ```
> Cada app debe traer su propio nginx: ver `nginx/telemetry.conf` como plantilla.

---

## Etapa 3 — Post-deploy (manual, una sola vez)

### 3.1 Seeds

```bash
# Usuarios de demo + motores/sensores (3 standards, 15 motores, 45 sensores, 3 usuarios)
docker exec backend-nestjs node dist-seed/seed.js

# Base de conocimiento RAG (vectoriza 200 fragments a Mongo `rag_knowledge`)
docker exec backend-nestjs node dist-seed/seed-embeddings.js

# IMPRESCINDIBLE: el seed escribe directo en la BD y el backend carga los sensores
# en memoria solo al arrancar. Sin este restart el dashboard aparece VACÍO.
docker restart backend-nestjs
```

> Las rutas son las que realmente quedan dentro de la imagen (`/app/dist-seed/`).
> El seed de RAG borra y reinserta las `embeddings`; correrlo de nuevo es seguro (idempotente).
> El seed de embeddings tarda ~4-5 min (vectoriza con onnxruntime); es normal.

### 3.2 Smoke test

1. `https://telemetry.artisandevs.site` → landing carga.
2. Login demo: `admin@telemetry.local` / `admin123` → dashboard con datos (simulador publicando).
3. `https://telemetry.artisandevs.site/api/motors` con JWT responde OK.
4. `https://telemetry.artisandevs.site/grafana/` → login `admin` / `GRAFANA_ADMIN_PASSWORD`.
5. Chat RAG del dashboard responde con contenido (usa `GROQ_API_KEY` + embeddings).
6. Landing → "Solicitar acceso" → llega mail de bienvenida (usa `RESEND_API_KEY`).

### 3.3 Si algo falla

- **App no responde**: `docker exec nginx-global nginx -t` y logs:
  `docker logs nginx-global --tail 30`, `docker compose -f /opt/apps/telemetry/docker-compose.yml ps`,
  `docker logs telemetry-nginx --tail 30`.
- **Backend**: `docker logs backend-nestjs --tail 50` (el boot reintenta conexiones MySQL/Mongo/Redis/MQTT con backoff).
- **Subdominio**: `dig telemetry.artisandevs.site` debe resolver al túnel;
  `systemctl status cloudflared` y `journalctl -u cloudflared -n 30`.

---

## Re-despliegues futuros

El mismo comando de la Etapa 2 sincroniza el proyecto, re-levanta lo que cambió,
recarga nginx si el conf cambió y asegura el subdominio en el túnel. No hace falta
repetir Etapa 1 ni 3.
