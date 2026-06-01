#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==> Starting Debug Linux Build for AniCli Electron <==${NC}"

# 1. Ensure we are in an npm project directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}[Error] package.json not found in the current directory!${NC}"
    echo "Please run this script from the root of your anicli-electron project."
    exit 1
fi

# 2. Check for node_modules and install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[Info] node_modules folder is missing. Installing dependencies...${NC}"
    npm install
fi

# 3. Ensure electron-builder is installed as a development dependency
if ! grep -q '"electron-builder"' package.json; then
    echo -e "${YELLOW}[Info] electron-builder is missing from package.json. Installing...${NC}"
    npm install --save-dev electron-builder
fi

# 4. Trigger the build
echo -e "${BLUE}==> Packaging application...${NC}"
echo "Building both unpacked debug directory ('dir') and self-contained 'AppImage'..."

# Config flags:
# - 'dir' creates an unpacked executable directory (best for debugging/ASAR inspection)
# - 'AppImage' compiles the standalone distributable package
# - --config.asar=false leaves the JS files unpacked inside the resource directory so you can debug the code in-place
npx electron-builder --linux dir AppImage \
    --config.asar=false \
    --config.productName="AniCli Electron" \
    --config.directories.output="dist"

# 5. Output Results
echo -e "${GREEN}[Success] Build completed successfully!${NC}"
echo -e "${BLUE}[Output] Unpacked Debug Directory:${NC} dist/linux-unpacked/ (Run: ./dist/linux-unpacked/anicli-electron)"
echo -e "${BLUE}[Output] Standalone AppImage:${NC}      dist/AniCli Electron-*.AppImage"
