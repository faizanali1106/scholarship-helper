#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  Starting Scholarship Helper..."
echo "  Keep this window open while applying."
echo ""
if ! command -v node &>/dev/null; then
  echo "  Node.js is not installed. Download from https://nodejs.org"
  read -p "Press Enter to close..."
  exit 1
fi
node launch.js
