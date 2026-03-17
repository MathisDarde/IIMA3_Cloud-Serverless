FROM node:20

WORKDIR /app/code/api/lambda_hono

COPY code/api/lambda_hono/package*.json ./

RUN npm install && ln -s /app/code/api/lambda_hono/node_modules /app/node_modules

CMD ["npm", "run", "dev"]
