#!/bin/bash
# Double-click on Mac: starts the read-only WhatsApp → Padova draft helper.
cd "$(dirname "$0")/../.." || exit 1
echo "Padova WhatsApp helper (read-only → drafts). Never sends."
echo "A browser page will open on this Mac with the QR code."
echo "Leave this window open. Press Ctrl+C to stop."
echo ""
if command -v npm >/dev/null 2>&1; then
  npm run intake:whatsapp-helper
else
  echo "Node/npm not found. Ask the developer to install Node.js 24 on this Mac."
  read -r -p "Press Enter to close…"
  exit 1
fi
