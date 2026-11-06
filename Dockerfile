# Grid Agentic: one image for any Docker host (DigitalOcean Droplet or App Platform, Hostinger VPS, AWS Lightsail, Render…).
# Build:  docker build -t grid-agentic .
# Run:    docker run --env-file .env.production -p 3000:3000 grid-agentic
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app /app
# Dev dependencies stay: the migration script runs with tsx at start-up.
RUN chown -R node:node /app/.next /app/public
USER node
EXPOSE 3000
# Applies database migrations (safe to repeat), then starts the server.
CMD ["sh", "-c", "npx tsx scripts/db-migrate.ts && npx next start -p ${PORT}"]
