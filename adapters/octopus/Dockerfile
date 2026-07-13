FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY packages/adapter-sdk/package.json packages/adapter-sdk/
COPY adapters/octopus/package.json adapters/octopus/
RUN yarn workspaces focus @helios/adapter-octopus

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared/
COPY packages/adapter-sdk packages/adapter-sdk/
COPY adapters/octopus adapters/octopus/
RUN yarn workspace @helios/shared build
RUN yarn workspace @helios/adapter-sdk build
RUN yarn workspace @helios/adapter-octopus build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/packages/adapter-sdk/package.json packages/adapter-sdk/package.json
COPY --from=build /app/packages/adapter-sdk/dist packages/adapter-sdk/dist/
COPY --from=build /app/adapters/octopus/dist adapters/octopus/dist/
COPY --from=deps /app/node_modules node_modules/
CMD ["node", "adapters/octopus/dist/index.js"]
