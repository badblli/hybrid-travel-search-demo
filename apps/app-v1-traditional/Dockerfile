FROM node:20-alpine

WORKDIR /workspace

COPY shared ./shared
COPY apps/app-v1-traditional ./apps/app-v1-traditional

WORKDIR /workspace
RUN cp apps/app-v1-traditional/package.json ./package.json && npm install

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/app-v1-traditional/server.js"]
