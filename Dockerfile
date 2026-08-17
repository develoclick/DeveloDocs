# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: builder — installs full dependency tree and compiles TypeScript.
# Uses a lightweight Node image; no browser binaries are needed to compile.
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime — Playwright's official image ships Chromium plus every
# OS-level dependency it needs to run headless. The version tag MUST match
# the "playwright" package version resolved in package-lock.json, or the
# browser revision baked into this image won't match what the npm package
# expects at runtime.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Install only production dependencies — devDependencies (typescript, tsx,
# vitest, @types/node, pino-pretty) never reach the final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output and the .hbs templates read at runtime (templateEngine.ts
# resolves them relative to process.cwd(), not dist/).
COPY --from=builder /app/dist ./dist
COPY src/templates ./src/templates

# The base image ships a pre-created non-root "pwuser" with permission to
# drive the bundled Chromium; run as that user instead of root.
RUN mkdir -p /app/.tmp && chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
