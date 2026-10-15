#!/bin/bash
# Double-click this file to open Website Studio (add episodes, preview, publish).
cd "$(dirname "$0")/.." || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Website Studio needs Python 3, which this computer doesn't have yet."
  echo "Ask Claude to help install it, then double-click this file again."
  read -r -p "Press Return to close."
  exit 1
fi

python3 Tools/studio/studio.py
