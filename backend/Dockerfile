# Multi-stage build for NestJS backend
# Stage 1: install deps and build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Compile seed script (for one-time execution via docker exec, not on every boot)
RUN npx tsc prisma/seed.ts --outDir dist-seed --esModuleInterop --resolveJsonModule --skipLibCheck

# Stage 2: production image
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-seed ./dist-seed
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# Only migrate on startup (idempotent, fast if already current).
# Seed is run ONCE manually: docker exec backend-nestjs node dist-seed/prisma/seed.js
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
