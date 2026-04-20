# Worker Dockerfile (Railway).
# Vercel ignores this and uses its own Next.js build pipeline.

FROM node:22-alpine

WORKDIR /app

# Copy every workspace manifest first so `npm ci` can resolve the
# workspace graph. Keep this layer cache-friendly — only package.json
# files land here, not source code.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY worker/package.json ./worker/

# Include devDependencies so tsx is available at runtime.
ENV NODE_ENV=development
RUN npm ci

# Now bring in the actual source. The app under src/ is NOT needed
# by the worker, so we skip it to keep the image small.
COPY packages/shared ./packages/shared
COPY worker ./worker

CMD ["npm", "start", "-w", "muto-worker"]
