#!/bin/bash
# Double-click this file to start Subbie - Storefront (React / Vite).

cd "$(dirname "$0")" || exit 1

PORT=5173
URL="http://localhost:${PORT}"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  echo "Stopping existing process on port ${PORT}..."
  lsof -ti tcp:"${PORT}" | xargs kill -9 2>/dev/null
  sleep 0.4
fi

echo "Starting Subbie - Storefront (React) at ${URL}"
echo "Keep this window open while browsing. Press Ctrl+C to stop."
echo ""

(sleep 0.8 && open "${URL}") &

npm run dev -- --port "${PORT}" --host
