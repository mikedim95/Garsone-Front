# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG VITE_API_URL=/api
ARG VITE_LOCAL_ONLY=true
ARG VITE_PUBLIC_BASE_ORIGIN
ARG VITE_PUBLIC_CODE_BASE
ARG VITE_OFFLINE
ARG VITE_ENABLE_OFFLINE_MODE
ARG VITE_DEFAULT_EMAIL_DOMAIN
ARG VITE_ENABLE_DEBUG_LOGIN

ENV VITE_API_URL=$VITE_API_URL \
  VITE_LOCAL_ONLY=$VITE_LOCAL_ONLY \
  VITE_PUBLIC_BASE_ORIGIN=$VITE_PUBLIC_BASE_ORIGIN \
  VITE_PUBLIC_CODE_BASE=$VITE_PUBLIC_CODE_BASE \
  VITE_OFFLINE=$VITE_OFFLINE \
  VITE_ENABLE_OFFLINE_MODE=$VITE_ENABLE_OFFLINE_MODE \
  VITE_DEFAULT_EMAIL_DOMAIN=$VITE_DEFAULT_EMAIL_DOMAIN \
  VITE_ENABLE_DEBUG_LOGIN=$VITE_ENABLE_DEBUG_LOGIN

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

# Older managed Pi agents use this container name and cannot pass an override.
# Standalone Compose explicitly selects its own service name instead.
ENV CORE_UPSTREAM=garsone-local-core:8787
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
