# Ansible - Despliegue automatizado

Automatización del despliegue de aplicaciones en EC2 con la arquitectura:
`Cloudflare → tunnel (cloudflared) → nginx → app`

## Arquitectura

```
Cloudflare → tunnel (invisible) → nginx:80 → app (frontend + backend)
```

- Cada app tiene su propio subdominio (ej: `tienda.artisandevs.site`)
- nginx enruta por `server_name` a diferentes contenedores
- Cada app crea un archivo `.conf` en nginx (se recarga automáticamente)

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

## Frontend

Si tu frontend es React/Vue/Angular, necesita:
1. Un `Dockerfile` que haga build con Node.js y sirva con nginx
2. Un `nginx.conf` que maneje SPA routing

Ver el frontend de este proyecto como ejemplo: `frontend/Dockerfile`

## Documentación completa

Ver `~/Documentos/configuraciones/configuraciones/ansible.md` para:
- Cómo encontrar el tunnel ID
- Cómo configurar los archivos antes de ejecutar
- Comandos útiles de Cloudflare
- Solución de problemas
