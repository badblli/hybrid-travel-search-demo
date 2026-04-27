FROM node:20-alpine

WORKDIR /workspace

COPY shared ./shared
COPY apps/app-v2-atlas-search ./apps/app-v2-atlas-search

WORKDIR /workspace
RUN cp apps/app-v2-atlas-search/package.json ./package.json && npm install

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/app-v2-atlas-search/server.js"]
