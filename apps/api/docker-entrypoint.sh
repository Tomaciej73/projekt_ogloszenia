#!/bin/sh
set -eu

cd "$(dirname "$0")"

echo "Applying Prisma migrations..."
if [ -x "./node_modules/.bin/prisma" ]; then
  ./node_modules/.bin/prisma migrate deploy --config prisma.config.ts --schema=prisma/schema.prisma
else
  pnpm exec prisma migrate deploy --config prisma.config.ts --schema=prisma/schema.prisma
fi

echo "Starting API server..."
exec node db-server.js
