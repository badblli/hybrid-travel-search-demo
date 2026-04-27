FROM node:20-alpine

WORKDIR /workspace

COPY shared ./shared
COPY apps/app-v3-hybrid-search ./apps/app-v3-hybrid-search

WORKDIR /workspace
RUN cp apps/app-v3-hybrid-search/package.json ./package.json && npm install

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/app-v3-hybrid-search/server.js"]
