# 运行时只需要 Node + 静态文件；构建阶段把 pdf.js / tesseract 资源 vendored 进来
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# vendor 完就不再需要 node_modules（服务端零依赖）
RUN npm run vendor && rm -rf node_modules

ENV NODE_ENV=production \
    PORT=3080 \
    HOST=0.0.0.0 \
    JD_DB=/app/data/jdpool.sqlite

EXPOSE 3080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3080/api/health || exit 1

CMD ["node", "src/server.js"]
