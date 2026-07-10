#!/bin/sh
set -eu

echo "Applying Prisma migrations..."
pnpm --dir apps/api exec prisma migrate deploy --config prisma.config.ts --schema=prisma/schema.prisma

echo "Starting API server..."
exec node apps/api/db-server.js
