FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production, optionally add build tools if sqlite3 needs them)
# sqlite3 usually has prebuilt binaries, but alpine might need python/make depending on arch
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev \
    && apk del python3 make g++

# Copy source code
COPY src/ ./src/
COPY schema.sql ./
COPY README.md ./

# Use the krusch-memory command
ENV NODE_ENV=production

# Expose port if needed (MCP primarily uses stdio, but good for future proofing)
# EXPOSE 5441 

ENTRYPOINT ["node", "src/index.js"]
