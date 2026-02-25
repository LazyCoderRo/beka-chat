FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the project
COPY src ./src
COPY server ./server
COPY public ./public
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY index.html ./

# Create uploads directory
RUN mkdir -p uploads

# Build TypeScript files
RUN npm run build

# Expose ports: 80 for frontend, 3001 for backend
EXPOSE 80 3001

# Set environment to development
ENV NODE_ENV=development

# Run the dev server
CMD ["npm", "run", "dev"]
