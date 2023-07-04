FROM node:20-alpine3.18

RUN apk --update add freeswitch
WORKDIR /opt
COPY package.json /opt/
COPY yarn.lock /opt/
RUN yarn --frozen-lockfile --non-interactive
COPY build.mjs /opt/
COPY src /opt/src
RUN yarn build
COPY test /opt/test
RUN yarn syntax
RUN yarn test
