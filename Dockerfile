# Build the browser client, then ship it with the game server.
#
# The server runs its TypeScript directly through tsx rather than being
# compiled. The workspace packages export TypeScript source — that is what
# makes the fast development loop work — and tsx resolves them exactly as
# Vite and Vitest already do. Compiling the server would mean solving the
# packaging of every workspace package first, for no gain at this size.

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/rules/package.json packages/rules/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
# Copies whatever sound files are present and writes their manifest.
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/rules/package.json packages/rules/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

COPY packages/ packages/
COPY apps/server/ apps/server/
COPY --from=build /app/apps/web/dist apps/web/dist

# Never as root.
USER node

EXPOSE 3001
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "@greed/server"]
