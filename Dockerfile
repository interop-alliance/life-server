FROM node:12-slim

# Install git so npm can install git dependencies
RUN apt-get update && apt-get install -y \
  git \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash -g root -G sudo -u 1001 life-server

WORKDIR /usr/src/app
RUN chown -R life-server:root .

USER life-server

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install

# add directories
COPY bin bin
COPY config config
COPY common common
COPY src src
COPY test test
# add files
COPY \
  .npmrc \
  config.default.js \
  LICENSE.md \
  package.json \
  README.md \
  ./
# This is used by default config.js as 'root' dir
# And if it doesn't exist, app will error with/
# Error: EEXIST: file already exists, mkdir '/usr/src/app/data/localhost'
RUN mkdir data

# Include default configuration
COPY config.default.js config.dev.js
#RUN openssl req \
#    -new \
#    -newkey rsa:4096 \
#    -days 365 \
#    -nodes \
#    -x509 \
#    -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=localhost" \
#    -keyout privkey.pem \
#    -out fullchain.pem

EXPOSE 7070
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
CMD ["node", "./bin/server", "start"]
