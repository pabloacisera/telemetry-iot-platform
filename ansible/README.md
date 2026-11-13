# Ansible - Despliegue automatizado

Automatización del despliegue de aplicaciones en EC2 con la arquitectura:

```
Cloudflare → tunnel (cloudflared) → nginx-global:80 → <app>-nginx:80 → app interna
```

## Arquitectura

```
Cloudflare → túnel (invisible) → :80 nginx-global → <app>-nginx → (frontend + backend + db internos)
```

- El **nginx-global** es "tonto": rutea **solo por subdominio** a `http://<app>-nginx:80`.
  No conoce (ni debe conocer) los servicios internos de cada app.
- Cada app vive en `/opt/apps/<app>/` y es **autocontenida**:
  - su **propio nginx** (contenedor `<app>-nginx`, puerto 80 interno, sin publicar),
  - su red `<app>-net` (la crea `docker compose`, no se crea a mano),
  - su `docker-compose.yml` (frontend/backend/DB en red interna, sin exponer puertos).
- Todo el routing interno (`/`, `/api`, `/socket.io`, `/grafana`) lo hace el nginx de la app.
- Ansible conecta `<app>-net` a `nginx-global` (`docker network connect`) para que el
  global resuelva el nombre `<app>-nginx`.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `deploy-app.yml` | Playbook genérico para desplegar cualquier app |
| `playbook.yml` | Playbook específico para el telemetry platform |
| `inventory.ini` | IP y key SSH de la EC2 |
| `files/.env.production` | Variables de entorno (una por app) |
| `files/nginx/` | Conf **global mínimo** (un `.conf` por app: subdominio → `<app>-nginx:80`) |

## Uso rápido

```bash
cd ansible
source ~/.venvs/ansible/bin/activate

# Desplegar una app
ansible-playbook deploy-app.yml -i inventory.ini \
  -e "app_name=mi-app" \
  -e "app_subdomains=mi-app.artisandevs.site" \
  -e "tunnel_name=mi-tunnel"
```

`tunnel_name` es obligatorio: es el nombre del túnel de cloudflared creado en la
etapa manual (`cloudflared tunnel create <tunnel>`). El playbook registra cada
subdominio en ese túnel (`cloudflared tunnel route dns`) para que la app quede
con su URL https.

## Cómo debe ser una app para desplegarla

1. **`docker-compose.yml`** en la raíz del proyecto con un servicio **`<app>-nginx`**
   (imagen `nginx:alpine`) que monta el conf de routing interno y NO publica puertos:

   ```yaml
   services:
     <app>-nginx:
       image: nginx:alpine
       container_name: <app>-nginx
       restart: unless-stopped
       volumes:
         - ./nginx/<app>.conf:/etc/nginx/conf.d/default.conf:ro
       networks:
         - <app>-net
     # ... frontend, backend, db ...
   networks:
     <app>-net:
       name: <app>-net
   ```

2. **`nginx/<app>.conf`**: routing interno (ver `nginx/telemetry.conf` del repo como plantilla).
   Los `proxy_pass` apuntan a los nombres de servicio del propio compose.

3. **`ansible/files/nginx/<app>.conf`**: conf global **mínimo**:

   ```nginx
   server {
       listen 80;
       server_name mi-app.artisandevs.site;
       location / {
           proxy_pass http://mi-app-nginx:80;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

## ``.env.production` (obligatorio antes de desplegar)

Antes de ejecutar el playbook hay que **poblar `files/.env.production`** con los valores reales.
Los placeholder `CHANGE_ME` rompen el deploy (credenciales vacías/incompatibles).

Las credenciales MQTT (`MQTT_BACKEND_USER` / `MQTT_BACKEND_PASS` y el prefijo
`MQTT_ESP32_PASS_PREFIX`) deben ser **las mismas** que definen los usuarios de
`mosquitto/password_file` (broker). Ese archivo no se genera en el deploy: se
obtiene ejecutando `mosquitto/generate_passwords.py` localmente. Si el broker
queda con unas contraseñas y `.env.production` con otras, backend/simulador no
logran autenticarse contra Mosquitto y el sistema no arranca.

Regla: **ejecutar `generate_passwords.py` primero, y usar las credenciales que
produzca para poblar `MQTT_*` en `.env.production`.**

### Variables de build del frontend (URL de Grafana)

`VITE_GRAFANA_URL` se inyecta en **build-time** (ARG del `frontend/Dockerfile`), no en runtime.
Debe apuntar al dominio de producción (`https://telemetry.artisandevs.site/grafana/`).

Como `playbook.yml` usa `build: policy`, Docker Compose solo reconstruye el frontend si la
imagen **no existe**. Si ya existe una imagen con la URL anterior, un redeploy con
`VITE_GRAFANA_URL` nuevo **no la actualiza**. Para forzar el rebuild en la EC2:

```bash
cd /opt/apps/telemetry && docker compose build frontend && docker compose up -d frontend
```

## Frontend

Si tu frontend es React/Vue/Angular:
1. Un `Dockerfile` que haga build con Node.js y sirva con `vite preview` (u otro servidor estático).
2. **NO necesita su propio nginx público**: el nginx de la app (`<app>-nginx`) enruta
   `/` a ese contenedor y `/api` / `/socket.io` hacia el backend interno.

## Prerrequisitos en la EC2 (etapa manual, una vez)

- Docker + Docker Compose v2 instalados.
- `nginx-global` corriendo en `/opt/infra` (puerto 80, `conf.d/` montado, `default.conf`).
- cloudflared instalado como binario con systemd y un túnel creado (`cloudflared tunnel create`).
- Ver `docs/28-first-deploy-runbook.md` para el registro completo de la etapa manual.

## Documentación completa

Ver `~/Documentos/configuraciones/configuraciones/ansible.md` para:
- Cómo encontrar el tunnel ID
- Cómo configurar los archivos antes de ejecutar
- Comandos útiles de Cloudflare
- Solución de problemas
