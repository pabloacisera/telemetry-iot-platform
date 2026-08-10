```mermaid
graph TB
    subgraph "INTERNET"
        User["👤 Usuario"]
        CF["☁️ Cloudflare<br/>DNS + SSL"]
    end

    subgraph "EC2 (13.59.198.49)"
        subgraph "TUNNEL (invisible)"
            CF_Tunnel["🔗 cloudflared<br/>Túnel seguro"]
        end

        subgraph "NGINX (nginx-global)"
            NGINX["🔄 nginx<br/>Puerto 80<br/>Routing por subdominio"]
        end

        subgraph "APLICACIONES"
            subgraph "App: Telemetry"
                Telemetry_FE["📱 Frontend<br/>telemetry.artisandevs.site"]
                Telemetry_BE["⚙️ Backend NestJS<br/>/api + /socket.io (interno)"]
            end

            subgraph "App: Tienda"
                Tienda_FE["📱 Frontend<br/>tienda.artisandevs.site"]
                Tienda_BE["⚙️ Backend API<br/>pagos.artisandevs.site"]
            end

            subgraph "App: Blog"
                Blog_WP["📝 WordPress<br/>blog.artisandevs.site"]
            end
        end

        subgraph "INFRAESTRUCTURA (compartida)"
            MQTT["📡 Mosquitto<br/>MQTT Broker"]
            MySQL["🗄️ MySQL<br/>Base de datos"]
            MongoDB["🍃 MongoDB<br/>RAG Store"]
            Redis["🔴 Redis<br/>Cache"]
        end

        subgraph "REDES DOCKER"
            Net_Infra["🔗 infra-net<br/>(nginx + cloudflared)"]
            Net_Telemetry["🔗 telemetry-net"]
            Net_Tienda["🔗 tienda-net"]
            Net_Blog["🔗 blog-net"]
        end
    end

    %% Conexiones externas
    User -->|"tienda.artisandevs.site"| CF
    CF -->|"Túnel UUID"| CF_Tunnel

    %% Tunnel a nginx
    CF_Tunnel -->|"http://localhost:80"| NGINX

    %% Nginx a apps (routing por subdominio)
    NGINX -->|"telemetry.artisandevs.site"| Telemetry_FE
    NGINX -->|"telemetry.artisandevs.site/api"| Telemetry_BE
    NGINX -->|"tienda.artisandevs.site"| Tienda_FE
    NGINX -->|"pagos.artisandevs.site"| Tienda_BE
    NGINX -->|"blog.artisandevs.site"| Blog_WP

    %% Apps a infraestructura
    Telemetry_BE --> MQTT
    Telemetry_BE --> MySQL
    Telemetry_BE --> MongoDB
    Telemetry_BE --> Redis
    Tienda_BE --> MySQL

    %% Redes Docker
    NGINX -.->|"conectado a"| Net_Infra
    CF_Tunnel -.->|"conectado a"| Net_Infra
    Telemetry_FE -.-> Net_Telemetry
    Telemetry_BE -.-> Net_Telemetry
    Tienda_FE -.-> Net_Tienda
    Tienda_BE -.-> Net_Tienda
    Blog_WP -.-> Net_Blog

    %% Conexión de redes a nginx
    Net_Telemetry -.->|"docker network connect"| NGINX
    Net_Tienda -.->|"docker network connect"| NGINX
    Net_Blog -.->|"docker network connect"| NGINX

    %% Estilos
    classDef cloud fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef tunnel fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef nginx fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef app fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef infra fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef network fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5

    class CF,User cloud
    class CF_Tunnel tunnel
    class NGINX nginx
    class Telemetry_FE,Telemetry_BE,Tienda_FE,Tienda_BE,Blog_WP app
    class MQTT,MySQL,MongoDB,Redis infra
    class Net_Infra,Net_Telemetry,Net_Tienda,Net_Blog network
```

## Flujo de una petición

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant CF as ☁️ Cloudflare
    participant T as 🔗 Tunnel
    participant N as 🔄 nginx
    participant App as 📱 App

    U->>CF: tienda.artisandevs.site
    CF->>T: Túnel UUID (HTTPS → HTTP)
    T->>N: localhost:80
    N->>N: Analiza Host header
    N->>App: proxy_pass http://frontend:80
    App->>N: Respuesta HTML
    N->>T: Respuesta
    T->>CF: Respuesta
    CF->>U: Página web
```

## Arquitectura Docker

```mermaid
graph LR
    subgraph "Contenedores"
        NGINX["nginx-global<br/>Puerto: 80"]
        CF["cloudflared<br/>Túnel"]
        App1["app-frontend"]
        App2["app-backend"]
        App3["app-db"]
    end

    subgraph "Redes Docker"
        N1["infra-net"]
        N2["app-net"]
    end

    subgraph "Volumenes"
        V1["app-data"]
    end

    NGINX --> N1
    CF --> N1
    App1 --> N2
    App2 --> N2
    App3 --> N2
    App3 --> V1

    N1 -.->|"docker network connect"| N2

    style N1 fill:#e3f2fd,stroke:#1565c0
    style N2 fill:#e8f5e9,stroke:#2e7d32
```

## Estructura de archivos en EC2

```
/home/ec2-user/
├── .cloudflared/
│   ├── config.yml                    ← Configuración del tunnel
│   ├── <UUID>.json                   ← Credenciales del tunnel
│   └── cert.pem                      ← Certificado

/opt/infra/
├── docker-compose.yml                ← nginx + cloudflared
└── conf.d/
    ├── default.conf                  ← Catch-all (404)
    ├── telemetry.conf                ← Config de telemetry
    ├── tienda.conf                   ← Config de tienda
    └── blog.conf                     ← Config de blog

/opt/apps/
├── telemetry-platform/
│   ├── docker-compose.yml
│   ├── backend/
│   ├── frontend/
│   └── ...
├── tienda/
│   ├── docker-compose.yml
│   ├── frontend/
│   ├── backend/
│   └── ...
└── blog/
    ├── docker-compose.yml
    └── wordpress/
```

## Registro de subdominios

```mermaid
graph LR
    subgraph "Cloudflare DNS"
        D1["tienda.artisandevs.site<br/>→ CNAME → UUID.cfargotunnel.com"]
        D2["pagos.artisandevs.site<br/>→ CNAME → UUID.cfargotunnel.com"]
        D3["blog.artisandevs.site<br/>→ CNAME → UUID.cfargotunnel.com"]
        D4["telemetry.artisandevs.site<br/>→ CNAME → UUID.cfargotunnel.com"]
    end

    subgraph "Tunnel UUID"
        T[" cloudflared<br/>a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
    end

    D1 --> T
    D2 --> T
    D3 --> T
    D4 --> T

    style T fill:#f3e5f5,stroke:#4a148c
```
