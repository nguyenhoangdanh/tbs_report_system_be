#!/bin/bash
set -e

# This is a wrapper for the deploy script to avoid pnpm workspace conflicts
echo "🚀 Running custom deploy script..."
exec ./scripts/deploy.sh "$@"
