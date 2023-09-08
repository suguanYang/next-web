FROM node:16.19.1 AS build

WORKDIR /app

COPY package.json /app
COPY .npmrc /app
RUN yarn config set cache-folder /usr/yarn/.cache && \
    yarn install

COPY ./src /app/src
COPY tsconfig.json /app
RUN yarn tsc

FROM node:16.19.1

WORKDIR /app


# reuse the cache from build
COPY --from=build /usr/yarn/.cache /usr/yarn/.cache
COPY --from=build /app/yarn.lock /app/yarn.lock
# we only need js files at runtime
COPY --from=build --chown=node:node /app/dist /app/src

COPY --chown=node:node package.json /app

# no need npmrc since we use --prefer-offline
RUN yarn config set cache-folder  /usr/yarn/.cache && \
    yarn install --prefer-offline --production

# shared-deps as a runtime dependency
COPY --chown=node:node ./shared-deps /app/shared-deps

COPY --chown=node:node ./shared-deps /shared-deps
## this folder has js files
COPY --chown=node:node ./src/source-management/client /app/src/source-management/client
## git shell will be invoked at runtime
COPY --chown=node:node ./src/service/git/shell /app/src/service/git/shell

# we may create files at /app, should take the permission of the workspace
RUN chown node:node /app
# allow node bind on privileged port
RUN setcap 'cap_net_bind_service=+ep'  $(eval readlink -f `which node`)

USER node

# pnpm's artifacts will be updated at runtime, we need run command as node
RUN cd shared-deps && npx pnpm install --prod

ENV NODE_ENV production
ENV ENABLE_NODE_LOG YES
ENV NODE_LOG_DIR /tmp
ENV NODE_OPTIONS --max-old-space-size=8192
ENV DEBUG vite:transform,vite:time

# ENV PORT 80
# ENV NACOS_SERVER_HOST mse-a92b2d32-p.nacos-ans.mse.aliyuncs.com
# ENV NACOS_SERVER_PORT 8848

# ENV OSS_DOMAIN_NAME https://dev.ylioo.com
# ENV SERVICE_DOMAIN_NAME https://service-dev.ylioo.com

EXPOSE ${PORT}

CMD  ["node", "src/app.js"]
