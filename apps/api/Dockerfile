FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN yarn workspaces focus @helios/api 

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared/
COPY apps/api apps/api/
RUN yarn workspace @helios/shared build
RUN yarn workspace @helios/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/apps/api/dist apps/api/dist/
COPY --from=deps /app/node_modules node_modules/
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health | grep -q ok
CMD ["node", "apps/api/dist/index.js"]
