# gitlab-mcp — Streamable HTTP transport (dist/http-server.js)
#
# For stdio (editor/CLI use) run the image with: node dist/index.js

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && test -f dist/http-server.js

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3101

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.MCP_HTTP_PORT||3101;require('http').get({host:'127.0.0.1',port:p,path:'/mcp'},r=>process.exit(r.statusCode===405?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/http-server.js"]
