# Ansible - Despliegue automatizado

Automatización del despliegue de aplicaciones en EC2 con la arquitectura:
`Cloudflare → tunnel (cloudflared) → nginx → app`

## Arquitectura

```
Cloudflare → tunnel (invisible) → nginx:80 → app (frontend + backend)
```

- Cada app tiene su propio subdominio (ej: `telemetry.artisandevs.site`)
- nginx enruta por `server_name` a los servicios del contenedor (frontend y, vía `/api` y `/socket.io`, el backend)
- Cada app crea un archivo `.conf` en nginx (se recarga automáticamente)
- Cada app vive en `/opt/apps/<app>/` con su propio `docker-compose.yml` y red Docker (`<app>-net`)

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `deploy-app.yml` | Playbook genérico para desplegar cualquier app |
| `playbook.yml` | Playbook específico para el telemetry platform |
| `inventory.ini` | IP y key SSH de la EC2 |
| `files/.env.production` | Variables de entorno (una por app) |
| `files/nginx/` | Configs de nginx (un `.conf` por app) |

## Uso rápido

```bash
cd ansible

# Desplegar una app
ansible-playbook deploy-app.yml -i inventory.ini \
  -e "app_name=mi-app" \
  -e "app_subdomains=mi-app.artisandevs.site" \
  -e "tunnel_name=mi-tunnel"
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
2. **NO necesita su propio nginx**: el nginx-global enruta el subdominio al contenedor
   (`proxy_pass http://<container>:5173`) y sus rutas `/api` y `/socket.io` hacia el backend interno.

Ver el frontend de este proyecto como ejemplo: `frontend/Dockerfile` y
`ansible/files/nginx/telemetry.conf`.

## Documentación completa

Ver `~/Documentos/configuraciones/configuraciones/ansible.md` para:
- Cómo encontrar el tunnel ID
- Cómo configurar los archivos antes de ejecutar
- Comandos útiles de Cloudflare
- Solución de problemas
