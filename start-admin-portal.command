#!/bin/bash
# Double-click to open the Admin Portal logic prototype (does not touch the storefront).

cd "$(dirname "$0")/public" || exit 1

PORT=8777
URL="http://localhost:${PORT}/prototype-admin-app.html?variant=A"

if [ ! -f prototype-admin-portal.html ]; then
  echo "Missing prototype-admin-portal.html in public/"
  exit 1
fi

if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  echo "Stopping existing process on port ${PORT}..."
  lsof -ti tcp:"${PORT}" | xargs kill -9 2>/dev/null
  sleep 0.3
fi

echo "Serving admin portal prototype at ${URL}"
echo "Keep this window open. Press Ctrl+C to stop."
echo ""

(sleep 0.6 && open "${URL}") &

python3 -m http.server "${PORT}"
