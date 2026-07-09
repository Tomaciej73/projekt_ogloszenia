#!/bin/sh
set -eu

echo "Applying Prisma migrations..."
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "Starting API server..."
exec node apps/api/db-server.js
