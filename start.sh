#!/usr/bin/env bash
# Digital Asset Factory for macOS/Linux: ./start.sh to start the app.
cd "$(dirname "$0")"

if ! command -v node >/dev/null; then
  echo "Node.js 26+ is not installed. Get it from https://nodejs.org and run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies... this takes a few minutes."
  npm install || exit 1
fi

echo "Starting Digital Asset Factory. Leave this window open; close it to stop the app."
npm start