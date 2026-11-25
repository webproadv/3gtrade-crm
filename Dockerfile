# Immagine unica del CRM: API + interfaccia web sulla stessa porta.

FROM node:22-alpine AS api-build
WORKDIR /src/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS web-build
WORKDIR /src/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/web
WORKDIR /app/api
COPY --from=api-build /src/apps/api/package.json ./
COPY --from=api-build /src/apps/api/node_modules ./node_modules
COPY --from=api-build /src/apps/api/dist ./dist
COPY --from=api-build /src/apps/api/migrations ./migrations
COPY --from=web-build /src/apps/web/dist /app/web
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "dist/main.js"]
