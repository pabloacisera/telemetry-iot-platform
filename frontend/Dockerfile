# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Grafana quick-access link (dashboard header). Vite inlines import.meta.env.VITE_*
# at build time, so it must be provided here (not at runtime).
ARG VITE_GRAFANA_URL
ENV VITE_GRAFANA_URL=${VITE_GRAFANA_URL}
# Free-tier (t3.micro, 1GB RAM): cap V8 heap so the Vite build doesn't OOM
ENV NODE_OPTIONS=--max-old-space-size=384
RUN npm run build

# Stage 2: Serve with vite preview (no nginx — global nginx routes by subdomain)
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]