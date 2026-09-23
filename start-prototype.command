#!/bin/bash
# Double-click to open the Selective RFQ logic prototype (no Vite required).

cd "$(dirname "$0")/public" || exit 1

PORT=8766
URL="http://localhost:${PORT}/prototype-rfq-logic.html"

if [ ! -f prototype-rfq-logic.html ]; then
  echo "Missing prototype-rfq-logic.html in public/"
  exit 1
fi

if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  echo "Stopping existing process on port ${PORT}..."
  lsof -ti tcp:"${PORT}" | xargs kill -9 2>/dev/null
  sleep 0.3
fi

echo "Serving prototype at ${URL}"
echo "Keep this window open. Press Ctrl+C to stop."
echo ""

(sleep 0.6 && open "${URL}") &

python3 -m http.server "${PORT}"
