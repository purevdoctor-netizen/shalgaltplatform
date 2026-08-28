# syntax=docker/dockerfile:1
# =============================================================================
#  @shalgalt/web — React PWA, nginx-ээр статикаар түгээнэ
#  Монорепогийн ҮНДСЭН хавтаснаас build хийнэ:
#    docker build -f apps/web/Dockerfile -t shalgalt-web .
# =============================================================================

# ---------- 1. Хамаарал ----------
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile=false --filter @shalgalt/web... --filter @shalgalt/shared...

# ---------- 2. Build ----------
FROM deps AS build
WORKDIR /repo

# VITE_ хувьсагчид build үед л шингэдэг тул ARG-аар дамжуулна.
ARG VITE_APP_NAME="Шалгалтын платформ"
ARG VITE_API_BASE_URL=""
ARG VITE_PUBLIC_APP_URL=""
ARG VITE_QR_MAX_BYTES="1200"
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL \
    VITE_QR_MAX_BYTES=$VITE_QR_MAX_BYTES

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

WORKDIR /repo/apps/web
RUN pnpm run build

# ---------- 3. Түгээх ----------
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
