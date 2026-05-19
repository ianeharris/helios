FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY adapters/hive/package.json adapters/hive/
RUN yarn workspaces focus @helios/adapter-hive 

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared/
COPY adapters/hive adapters/hive/
RUN yarn workspace @helios/shared build
RUN yarn workspace @helios/adapter-hive build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/adapters/hive/dist adapters/hive/dist/
COPY --from=deps /app/node_modules node_modules/
CMD ["node", "adapters/hive/dist/index.js"]
