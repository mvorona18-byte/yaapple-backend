FROM public.ecr.aws/docker/library/node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["npm", "start"]
