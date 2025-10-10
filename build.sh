#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create dist directory if it doesn't exist
mkdir -p dist

# Common options
ENTRY="src/index.js"
BUNDLE="--bundle"
FORMAT="--format=esm"
TARGET="--target=es2020"
PLATFORM="--platform=browser"
SOURCEMAP="--sourcemap"
TREE_SHAKING="--tree-shaking=true"

# Check for watch mode
if [[ "$1" == "--watch" ]]; then
    echo -e "${BLUE}👀 Watching for changes...${NC}\n"

    # Build development version with watch
    npx esbuild $ENTRY $BUNDLE $FORMAT $TARGET $PLATFORM $SOURCEMAP $TREE_SHAKING \
        --outfile=dist/resilient.js \
        --watch &

    # Build minified version with watch
    npx esbuild $ENTRY $BUNDLE $FORMAT $TARGET $PLATFORM --sourcemap=external $TREE_SHAKING \
        --outfile=dist/resilient.min.js \
        --minify \
        --watch &

    echo -e "${GREEN}✅ Build complete. Watching for changes...${NC}"

    # Wait for all background processes
    wait
else
    echo -e "${BLUE}🔨 Building Resilient...${NC}\n"

    # Build development version
    npx esbuild $ENTRY $BUNDLE $FORMAT $TARGET $PLATFORM $SOURCEMAP $TREE_SHAKING \
        --outfile=dist/resilient.js

    # Build minified version
    npx esbuild $ENTRY $BUNDLE $FORMAT $TARGET $PLATFORM --sourcemap=external $TREE_SHAKING \
        --outfile=dist/resilient.min.js \
        --minify

    echo -e "\n${GREEN}✅ Build complete!${NC}"
    echo -e "   📦 dist/resilient.js (development)"
    echo -e "   📦 dist/resilient.min.js (production)"
fi
