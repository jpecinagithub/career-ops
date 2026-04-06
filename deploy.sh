#!/bin/bash
# Career-Ops deploy script for Oracle Cloud Ubuntu
set -e

APP_DIR="/var/www/career-ops"
echo "🚀 Deploying career-ops..."

cd "$APP_DIR"
git pull origin main

echo "📦 Installing server dependencies..."
cd server && npm install --production
cd ..

echo "🏗 Building frontend..."
cd client && npm install && npm run build
cd ..

echo "♻️ Restarting API server..."
pm2 restart career-ops-api || pm2 start ecosystem.config.cjs --env production

echo "✅ Deploy complete"
pm2 status career-ops-api
