# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

# ---------- Stage 1: install production dependencies only ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# Manifests first, so this layer is cached until dependencies change
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---------- Stage 2: small runtime image ----------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3006
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Run as the unprivileged "node" user that ships with the image
USER node

EXPOSE 3006

# Alpine has no curl, so use Node's built-in fetch (Node 22)
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/assignments/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
