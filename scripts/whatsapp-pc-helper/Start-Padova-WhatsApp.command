#!/bin/bash
# Nested copy — prefer package-root Start-Padova-WhatsApp.command
cd "$(dirname "$0")/../.." || exit 1
exec bash "./Start-Padova-WhatsApp.command"
