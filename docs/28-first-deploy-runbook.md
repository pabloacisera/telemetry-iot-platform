# Runbook: Primer despliegue en la EC2

Cómo se divide el trabajo:

| Etapa | Quién | Qué |
|---|---|---|
| 1. Infraestructura global | Vos, a mano | Docker, `nginx-global`, cloudflared, túnel y subdominio Cloudflare |
| 2. Desplegar la app | Ansible | Cargar el proyecto + `.env` + `docker compose up` + conectar red a nginx + conf de nginx |
| 3. Post-deploy | Manual (una vez) | Seeds de usuarios/motores y de RAG + smoke test |

Referencias: guía manual completa en `~/Documentos/configuraciones/configuraciones/deploy-guide.md` y `ansible.md`.

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

1. **Docker + Docker Compose v2** instalados y el usuario `ec2-user` en el grupo `docker`.
2. **nginx-global** corriendo (red `infra-net`, `/opt/infra/conf.d` existente, `default.conf`).
3. **cloudflared** instalado en la EC2, `cloudflared tunnel login` hecho, y un **túnel creado**.
4. **Subdominio** `telemetry.artisandevs.site` registrado al túnel:
   ```bash
   cloudflared tunnel route dns <tunnel> telemetry.artisandevs.site
   ```
5. **Conf de nginx global** para la app. Usar como canónico el archivo del repo
   `ansible/files/nginx/telemetry.conf` (cubre `/`, `/api/`, `/socket.io/` y `/grafana/`):
   copiar a `/opt/infra/conf.d/telemetry.conf` y recargar sin reiniciar:
   ```bash
   docker exec nginx-global nginx -t
   docker exec nginx-global nginx -s reload
   ```
   > No crear la red `telemetry-net` a mano: la crea `docker compose` en la Etapa 2.

Check rápido: `docker ps` (nginx-global + cloudflared Up), `cloudflared tunnel list`.

---

## Etapa 2 — Desplegar la app (Ansible, un solo comando)

```bash
cd /home/kscod/Escritorio/telemetry-system/project/ansible
source ~/.venvs/ansible/bin/activate
ansible-playbook playbook.yml -i inventory.ini
```

El playbook (idempotente, se puede repetir):
1. Copia el proyecto a `/opt/apps/telemetry/`.
2. Copia el `.env` (desde `ansible/files/.env.production`).
3. `docker compose up -d --build` (los 8 servicios).
4. Conecta `telemetry-net` a `nginx-global`.
5. Copia `files/nginx/telemetry.conf` a `/opt/infra/conf.d/telemetry.conf`.
6. Valida y recarga nginx global (nunca lo reinicia).

Al terminar: `https://telemetry.artisandevs.site` debe servir la landing.

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

- **App no responde**: `docker exec nginx-global nginx -t` y logs: `docker logs nginx-global --tail 30`, `docker compose -f /opt/apps/telemetry/docker-compose.yml ps`.
- **Backend**: `docker logs backend-nestjs --tail 50` (el boot reintenta conexiones MySQL/Mongo/Redis/MQTT con backoff).
- **Subdominio**: `dig telemetry.artisandevs.site` debe resolver al túnel; `docker logs cloudflared --tail 20`.

---

## Re-despliegues futuros

El mismo comando de la Etapa 2 (`ansible-playbook playbook.yml -i inventory.ini`) sincroniza el proyecto,
re-levanta lo que cambió y recarga nginx si el conf cambió. No hace falta repetir Etapa 1 ni 3.
