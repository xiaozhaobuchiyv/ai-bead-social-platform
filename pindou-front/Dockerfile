# ============ 前端镜像：构建 + Nginx 托管 ============
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
COPY . .
ARG VITE_API_BASE=http://localhost:3000
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# envsubst 模板：容器启动时用环境变量 BACKEND_UPSTREAM 注入 /api、/uploads 的上游地址
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
