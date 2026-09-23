#!/bin/bash
# Marketplace on 5178, Sales admin portal on 5179. Shared RFQ / product store.

cd "$(dirname "$0")" || exit 1

MM_PORT=5178
ADMIN_PORT=5179
MM_URL="http://localhost:${MM_PORT}/zh"
ADMIN_URL="http://localhost:${ADMIN_PORT}/"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if ! lsof -ti tcp:"${MM_PORT}" >/dev/null 2>&1; then
  echo "Starting marketplace on ${MM_PORT}..."
  npm run dev -- --port "${MM_PORT}" --host >/tmp/subbie-mm-5178.log 2>&1 &
  sleep 0.8
fi

if lsof -ti tcp:"${ADMIN_PORT}" >/dev/null 2>&1; then
  echo "Stopping existing process on port ${ADMIN_PORT}..."
  lsof -ti tcp:"${ADMIN_PORT}" | xargs kill -9 2>/dev/null
  sleep 0.4
fi

echo "Marketplace: ${MM_URL}"
echo "Admin portal: ${ADMIN_URL}"
echo "Keep this window open. Press Ctrl+C to stop the admin server."
echo ""

(sleep 0.8 && open "${ADMIN_URL}" && open "${MM_URL}") &

npm run dev:admin
