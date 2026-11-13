# ---- 阶段 1：构建前端 ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Vite emits the root changelog as the offline release-history fallback.
COPY CHANGELOG.md /app/CHANGELOG.md
RUN npm run build

# ---- 阶段 2：服务端运行 ----
FROM node:20-alpine
WORKDIR /app/server

ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=client-build /app/client/dist ../client/dist

# 房间/收藏等 JSON 持久化目录（建议挂载卷）
RUN mkdir -p data
VOLUME ["/app/server/data"]

EXPOSE 4000
CMD ["node", "index.js"]
