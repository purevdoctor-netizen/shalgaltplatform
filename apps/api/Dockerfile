# syntax=docker/dockerfile:1
# =============================================================================
#  @shalgalt/api — Express + Prisma
#  Монорепогийн ҮНДСЭН хавтаснаас build хийнэ:
#    docker build -f apps/api/Dockerfile -t shalgalt-api .
# =============================================================================

# ---------- 1. Хамаарал суулгах ----------
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

# Prisma-д OpenSSL шаардлагатай
RUN apk add --no-cache openssl

COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile=false --filter @shalgalt/api... --filter @shalgalt/shared...

# ---------- 2. Эмхэтгэх ----------
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

WORKDIR /repo/apps/api
RUN pnpm exec prisma generate
RUN pnpm exec tsup

# ---------- 3. Ажиллуулах ----------
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN apk add --no-cache openssl tini
WORKDIR /app

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000
ENV UPLOAD_DIR=/app/uploads

COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./node_modules_app

# pnpm-ийн симлинк бүтцийг хадгалахын тулд apps/api/node_modules-ийг нэгтгэнэ
RUN cp -a ./node_modules_app/. ./node_modules/ && rm -rf ./node_modules_app

RUN mkdir -p /app/uploads && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
# Ажиллахын өмнө migration-ыг хэрэглэнэ
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/index.js"]
