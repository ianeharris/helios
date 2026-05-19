FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY adapters/texecom/package.json adapters/texecom/
RUN yarn workspaces focus @helios/adapter-texecom 

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared/
COPY adapters/texecom adapters/texecom/
RUN yarn workspace @helios/shared build
RUN yarn workspace @helios/adapter-texecom build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/adapters/texecom/dist adapters/texecom/dist/
COPY --from=deps /app/node_modules node_modules/
CMD ["node", "adapters/texecom/dist/index.js"]
