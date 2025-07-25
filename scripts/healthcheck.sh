#!/bin/bash
# scripts/healthcheck.sh
# Health check script for the application

set -e

# Check if the application is responding
if curl -f -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "Application health check passed"
    exit 0
else
    echo "Application health check failed"
    exit 1
fi