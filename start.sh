#!/bin/bash
# Messenger Name-Lock Bot starter

# Agar node_modules folder missing hai to dependencies install karo
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Bot run karo
echo "🚀 Starting Messenger Name-Lock Bot..."
node bot.js
