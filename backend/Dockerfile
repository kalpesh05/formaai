# Stage 1: Build TypeScript backend
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production runtime environment
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/public ./public
ENV PORT=5000
EXPOSE 5000
CMD ["node", "dist/index.js"]
