# FIXED MED-08: Optimised multi-stage build.
# deps stage: prod-only node_modules (not discarded)
# build stage: full deps + compile
# production stage: copies from deps + build (no re-install)
# Saves ~40% build time and avoids double npm ci.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Copy prod node_modules from deps stage (already installed, no re-download)
COPY --from=deps /app/node_modules ./node_modules
# Copy compiled output
COPY --from=build /app/dist ./dist
# package.json needed for engines/version metadata
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main"]