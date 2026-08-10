# Guía de Despliegue

Esta guía explica cómo desplegar múltiples proyectos en una sola instancia EC2,
usando un nginx global como punto de entrada y Cloudflare para los subdominios.

---

## Fase 1: Configurar la infraestructura global

Esto se hace una sola vez en la EC2. Después no se vuelve a tocar.

### 1.1 Conectarse a la EC2

```bash
ssh -i ~/.ssh/tu-key.pem ubuntu@13.59.198.49
```

### 1.2 Instalar Docker

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Dar permisos al usuario actual (para no usar sudo siempre)
sudo usermod -aG docker $USER

# Aplicar cambios de grupo (o cerrar y volver a entrar)
newgrp docker

# Verificar que Docker funciona
docker --version
```

### 1.3 Instalar Docker Compose

```bash
# Verificar que ya viene con Docker
docker compose version

# Si no está, instalarlo
sudo apt install docker-compose-plugin -y
```

### 1.4 Crear la carpeta de infraestructura

```bash
# Crear carpetas
sudo mkdir -p /opt/infra/conf.d
sudo chown -R $USER:$USER /opt/infra
```

### 1.5 Crear la red Docker global

```bash
# Esta red la usará nginx para conectarse a todos los proyectos
docker network create infra-net
```

### 1.6 Crear el archivo de configuración de nginx

Crear el archivo `/opt/infra/conf.d/default.conf`:

```bash
cat > /opt/infra/conf.d/default.conf << 'EOF'
# Este archivo se modifica cuando se agrega un proyecto nuevo.
# Cada bloque "server" es un subdominio diferente.

# ─── Default: proyectos sin configurar ───
server {
    listen 80;
    server_name _;
    return 404 '{"error": "proyecto no encontrado"}';
    add_header Content-Type application/json;
}
EOF
```

### 1.7 Crear el docker-compose de infraestructura

Crear el archivo `/opt/infra/docker-compose.yml`:

```bash
cat > /opt/infra/docker-compose.yml << 'EOF'
services:
  nginx:
    image: nginx:alpine
    container_name: nginx-global
    ports:
      - "80:80"
    volumes:
      - ./conf.d:/etc/nginx/conf.d:ro
    restart: unless-stopped
    networks:
      - infra-net

networks:
  infra-net:
    external: true
EOF
```

### 1.8 Levantar nginx

```bash
cd /opt/infra
docker compose up -d

# Verificar que está corriendo
docker compose ps

# Verificar que responde
curl -s http://localhost
# Debe responder: 404 con el JSON de "proyecto no encontrado"
```

### 1.9 Configurar Cloudflare

Ir al dashboard de Cloudflare y crear un registro **A**:

1. Entrar a https://dash.cloudflare.com
2. Seleccionar el dominio `artisandevs.site`
3. Ir a **DNS** > **Records**
4. Hacer clic en **Add record**
5. Configurar:
   - **Type**: A
   - **Name**: `@` (para el dominio principal) o el nombre del subdominio
   - **IPv4 address**: `13.59.198.49`
   - **Proxy status**: Activado (nube naranja)
6. Hacer clic en **Save**

**Esto se repite por cada subdominio nuevo.**

### 1.10 Verificar que funciona

Abrir el navegador y visitar `http://artisandevs.site`. Debe mostrar el error 404
con el JSON de "proyecto no encontrado". Esto confirma que:
- Cloudflare está apuntando a tu EC2
- nginx está recibiendo las peticiones
- Todo funciona correctamente

---

## Fase 2: Agregar una aplicación

Cada vez que tengas un proyecto nuevo (frontend, backend, o ambos),
sigue estos pasos.

### 2.1 Crear la carpeta del proyecto

```bash
# En la EC2
sudo mkdir -p /opt/apps/mi-proyecto
sudo chown -R $USER:$USER /opt/apps/mi-proyecto
```

### 2.2 Copiar el proyecto desde tu máquina local

Desde tu máquina local (no desde la EC2):

```bash
# Ajustar la ruta de origen
scp -i ~/.ssh/tu-key.pem -r /ruta/a/tu/proyecto ubuntu@13.59.198.49:/opt/apps/mi-proyecto/
```

### 2.3 Crear la red Docker del proyecto

```bash
# En la EC2
docker network create mi-proyecto-net
```

### 2.4 Crear el docker-compose.yml del proyecto

Crear el archivo `/opt/apps/mi-proyecto/docker-compose.yml`:

```bash
cat > /opt/apps/mi-proyecto/docker-compose.yml << 'EOF'
services:
  # ─── Backend ───
  backend:
    build: ./backend
    env_file: .env
    restart: unless-stopped
    networks:
      - mi-proyecto-net

  # ─── Frontend (sin nginx propio — lo sirve el nginx global) ───
  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "5173:5173"   # solo si vas a alcanzarlo por el host; en prod lo rutiza el nginx global
    networks:
      - mi-proyecto-net

  # ─── Base de datos ───
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: mi_proyecto_db
      MYSQL_USER: mi_usuario
      MYSQL_PASSWORD: mi_password
    volumes:
      - db-data:/var/lib/mysql
    restart: unless-stopped
    networks:
      - mi-proyecto-net

networks:
  mi-proyecto-net:
    external: true

volumes:
  db-data:
EOF
```

**Importante**: El nombre de la red (`mi-proyecto-net`) debe ser el mismo
que creaste en el paso 2.3.

### 2.5 Conectar el proyecto a la red de nginx

```bash
# Conectar la red del proyecto a la red de infraestructura
docker network connect infra-net nginx-global
```

Esto permite que nginx llegue a los servicios de este proyecto.

### 2.6 Configurar nginx para este proyecto

Agregar un bloque `server` en `/opt/infra/conf.d/default.conf`:

```bash
cat > /opt/infra/conf.d/default.conf << 'EOF'
# ─── mi-proyecto.artisandevs.site ───
server {
    listen 80;
    server_name mi-proyecto.artisandevs.site;

    # Frontend (el frontend NO tiene nginx propio; sirve con vite preview)
    location / {
        proxy_pass http://frontend:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API (el prefijo /api se elimina con proxy_pass que termina en /)
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (si tu app lo necesita)
    location /socket.io/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# ─── Default: proyectos sin configurar ───
server {
    listen 80;
    server_name _;
    return 404 '{"error": "proyecto no encontrado"}';
    add_header Content-Type application/json;
}
EOF
```

**Importante**: Los nombres `frontend` y `backend` deben coincidir con los
nombres de los servicios en tu `docker-compose.yml`.

### 2.7 Reiniciar nginx para aplicar los cambios

```bash
docker exec nginx-global nginx -s reload
```

### 2.8 Levantar el proyecto

```bash
cd /opt/apps/mi-proyecto
docker compose up -d

# Verificar que todos los contenedores están corriendo
docker compose ps
```

### 2.9 Ejecutar migraciones de base de datos (si aplica)

```bash
# Ejecutar comandos dentro del contenedor del backend
docker compose exec backend npx prisma migrate deploy

# O si usas otro comando de migración
docker compose exec backend npm run migrate
```

### 2.10 Crear el subdominio en Cloudflare

1. Entrar a https://dash.cloudflare.com
2. Seleccionar `artisandevs.site`
3. Ir a **DNS** > **Records**
4. Hacer clic en **Add record**
5. Configurar:
   - **Type**: A
   - **Name**: `mi-proyecto` (se completará como `mi-proyecto.artisandevs.site`)
   - **IPv4 address**: `13.59.198.49`
   - **Proxy status**: Activado (nube naranja)
6. Hacer clic en **Save**

### 2.11 Verificar que funciona

Abrir el navegador y visitar `https://mi-proyecto.artisandevs.site`.
Debe mostrar tu aplicación.

También verificar la API:
```bash
curl -s https://mi-proyecto.artisandevs.site/api/health
```

---

## Fase 3: Agregar otra aplicación

Cuando tengas un segundo proyecto, repite la Fase 2 con estos cambios:

1. **Nombre diferente**: Usa un nombre diferente para la carpeta, la red y los servicios.
2. **Puertos diferentes**: Si los backends exponen puertos al host, usa puertos diferentes.
3. **Nuevo bloque server**: Agrega otro bloque `server` en nginx.conf con el nuevo subdominio.
4. **Nuevo registro DNS**: Crea otro registro A en Cloudflare.

### Ejemplo: agregar un segundo proyecto

```bash
# 1. Crear carpeta y red
sudo mkdir -p /opt/apps/otro-proyecto
docker network create otro-proyecto-net

# 2. Copiar proyecto
scp -i ~/.ssh/tu-key.pem -r /ruta/a/otro-proyecto ubuntu@13.59.198.49:/opt/apps/otro-proyecto/

# 3. Crear docker-compose.yml (similar al paso 2.4)
# 4. Conectar a la red de nginx (paso 2.5)
# 5. Agregar bloque server en nginx.conf (paso 2.6)
# 6. Reiniciar nginx (paso 2.7)
# 7. Levantar proyecto (paso 2.8)
# 8. Crear subdominio en Cloudflare (paso 2.10)
```

---

## Comandos útiles

### Ver logs de nginx

```bash
docker logs nginx-global
docker logs nginx-global -f  # en tiempo real
```

### Ver logs de un proyecto

```bash
cd /opt/apps/mi-proyecto
docker compose logs
docker compose logs -f backend  # solo el backend
```

### Detener un proyecto

```bash
cd /opt/apps/mi-proyecto
docker compose down
```

### Detener nginx (cuidado: apaga todos los proyectos)

```bash
cd /opt/infra
docker compose down
```

### Reiniciar nginx

```bash
docker exec nginx-global nginx -s reload
```

### Ver todas las redes Docker

```bash
docker network ls
```

### Ver qué contenedores están en una red

```bash
docker network inspect infra-net
```

### Eliminar un proyecto

```bash
# 1. Detener contenedores
cd /opt/apps/mi-proyecto
docker compose down -v  # -v elimina volúmenes (bases de datos)

# 2. Eliminar carpeta
sudo rm -rf /opt/apps/mi-proyecto

# 3. Eliminar red
docker network rm mi-proyecto-net

# 4. Quitar bloque server de nginx.conf
# 5. Reiniciar nginx
docker exec nginx-global nginx -s reload

# 6. Eliminar registro DNS en Cloudflare
```

---

## Solución de problemas

### "502 Bad Gateway"

nginx no puede llegar al servicio. Verificar:
1. El contenedor del servicio está corriendo: `docker compose ps`
2. El nombre del servicio en nginx.conf coincide con el nombre en docker-compose.yml
3. Los contenedores están en la misma red: `docker network inspect infra-net`

### "Connection refused"

El servicio no está escuchando en el puerto correcto. Verificar:
1. El backend escucha en el puerto 3000 (dentro del contenedor)
2. nginx hace proxy_pass a ese puerto

### "Host not found"

nginx no encuentra el nombre del servicio. Verificar:
1. Los contenedores están en la misma red Docker
2. El nombre del servicio en nginx.conf es exactamente igual al en docker-compose.yml

### No funciona el subdominio

Verificar:
1. El registro DNS existe en Cloudflare y apunta a `13.59.198.49`
2. El proxy está activado (nube naranja)
3. El bloque server en nginx.conf tiene el `server_name` correcto
4. Has reiniciado nginx después de cambiar la configuración
