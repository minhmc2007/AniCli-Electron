#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse -d target flag
TARGET=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        -d)
            shift
            TARGET="$1"
            ;;
        *)
            echo -e "${RED}[Error] Unknown argument: $1${NC}"
            echo "Usage: ./build.bash [-d linux|windows]"
            exit 1
            ;;
    esac
    shift
done

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

# 4. Branch on target
if [ "$TARGET" = "linux" ]; then
    echo -e "${BLUE}==> Starting Linux Build for AniCli Electron <==${NC}"
    echo "Building both unpacked debug directory ('dir') and self-contained 'AppImage'..."
    npx electron-builder --linux dir AppImage \
        --config.asar=false
    echo -e "${GREEN}[Success] Linux build completed!${NC}"
    echo -e "${BLUE}[Output] Unpacked Debug Directory:${NC} dist/linux-unpacked/ (Run: ./dist/linux-unpacked/anicli-electron)"
    echo -e "${BLUE}[Output] Standalone AppImage:${NC}      dist/AniCli Electron-*.AppImage"
elif [ "$TARGET" = "windows" ]; then
    echo -e "${BLUE}==> Starting Windows Build for AniCli Electron <==${NC}"
    echo "Building portable exe and NSIS installer..."
    npx electron-builder --win portable nsis \
        --config.asar=false
    echo -e "${GREEN}[Success] Windows build completed!${NC}"
    echo -e "${BLUE}[Output] Portable EXE:${NC}  dist/AniCli Electron-*.exe"
    echo -e "${BLUE}[Output] Installer:${NC}     dist/AniCli Electron Setup-*.exe"
else
    echo -e "${BLUE}==> Starting Default Build for AniCli Electron <==${NC}"
    echo "Building for the current platform..."
    npx electron-builder --config.asar=false
    echo -e "${GREEN}[Success] Build completed successfully!${NC}"
fi
