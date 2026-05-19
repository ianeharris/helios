FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN yarn workspaces focus @helios/web 

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared/
COPY apps/web apps/web/
RUN yarn workspace @helios/shared build
RUN yarn workspace @helios/web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
