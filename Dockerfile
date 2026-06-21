# syntax=docker/dockerfile:1

# ---- build stage ---------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# Instala todas as deps (inclui devDependencies para o `nest build`).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Remove devDependencies, mantendo apenas as de produção.
RUN npm prune --omit=dev

# ---- runtime stage -------------------------------------------------------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3333
WORKDIR /app

# Artefatos de execução.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Dados do jogo (lidos em runtime a partir de ROOT = /app).
COPY DataTable ./DataTable
COPY Game ./Game
COPY L10N ./L10N

EXPOSE 3333
CMD ["node", "dist/main"]
