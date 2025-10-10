#!/bin/bash

# Resilient Library Test Server Launcher

set -e

echo "🔧 Resilient Test Server Launcher"
echo "=================================="
echo ""

cd ./test

# Start the server
echo "🚀 Starting test server with go run..."
echo "🌐 Server available at: http://localhost:8080"
echo ""
echo "💡 Source files are served directly - changes take effect immediately!"
echo "   Just refresh your browser to see updates."
echo ""
echo "Press Ctrl+C to stop the server"
echo "=================================="
echo ""

exec go run .
