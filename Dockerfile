FROM node:24.19.0-bookworm-slim AS build
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:local

FROM node:24.19.0-bookworm-slim AS runtime
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node packages/database/migrations ./packages/database/migrations
USER node
ENV NODE_ENV=production PORT=4317
EXPOSE 4317
CMD ["node","dist/apps/api/main.js"]
