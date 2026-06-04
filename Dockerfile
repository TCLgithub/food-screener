FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY results.html ./
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
