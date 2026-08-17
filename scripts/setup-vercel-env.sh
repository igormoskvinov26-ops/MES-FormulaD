#!/bin/bash
# Setup Vercel environment variables for the project
# Run this from your local machine where you have `vercel` CLI authenticated

set -e

echo "Setting TELEGRAM_DRY_RUN=false on Vercel..."
vercel env add TELEGRAM_DRY_RUN < <(echo "false")

echo ""
echo "✅ Done! Redeploying..."
vercel redeploy --prod

echo ""
echo "🚀 Vercel is redeploying. Check https://vercel.com/igormoskvinov26-ops/mes-formulad for status."
