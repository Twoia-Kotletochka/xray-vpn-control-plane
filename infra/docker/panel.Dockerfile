FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json biome.json .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm install --workspaces --include-workspace-root

COPY . .

RUN npm run build -w apps/web

FROM caddy:2.10-alpine

COPY infra/caddy /etc/caddy
COPY --from=build /app/apps/web/dist /srv/web

EXPOSE 80 443
