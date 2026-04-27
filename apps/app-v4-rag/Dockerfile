FROM node:20-alpine

WORKDIR /workspace

COPY shared ./shared
COPY apps/app-v4-rag ./apps/app-v4-rag

WORKDIR /workspace
RUN cp apps/app-v4-rag/package.json ./package.json && npm install

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/app-v4-rag/server.js"]
