# Dedizierter Online-Server (z. B. auf einem VPS): docker build -t zerfallzone . && docker run -p 7777:7777 zerfallzone
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY public ./public
EXPOSE 7777
CMD ["node", "server/server.js"]
