#!/bin/sh
# Used by .claude/launch.json (Browser pane). $1 = dev | preview, $2 = port.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
if [ "$1" = "preview" ]; then
  exec node node_modules/vite/bin/vite.js preview --port "$2" --strictPort
fi
node scripts/content.mjs --dev && exec node node_modules/vite/bin/vite.js --port "$2" --strictPort
