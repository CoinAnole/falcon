#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Installing Falcon...${NC}"

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}Bun not found. Installing Bun first...${NC}"
    curl -fsSL https://bun.sh/install | bash

    # Source bun for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if ! command -v bun &> /dev/null; then
        echo -e "${RED}Failed to install Bun. Please install manually: https://bun.sh${NC}"
        exit 1
    fi
    echo -e "${GREEN}Bun installed successfully${NC}"
fi

# Install directory
INSTALL_DIR="$HOME/.falcon/bin"
mkdir -p "$INSTALL_DIR"

# Clone or update
REPO_DIR="$HOME/.falcon/repo"
if [ -d "$REPO_DIR" ]; then
    echo "Updating Falcon..."
    cd "$REPO_DIR"
    git pull --quiet
else
    echo "Downloading Falcon..."
    git clone --quiet https://github.com/coinanole/falcon.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# Install dependencies
echo "Installing dependencies..."
bun install --silent

# Create launcher script
cat > "$INSTALL_DIR/falcon" << 'EOF'
#!/bin/bash
exec bun run "$HOME/.falcon/repo/src/index.ts" "$@"
EOF
chmod +x "$INSTALL_DIR/falcon"

# Add to PATH instructions
SHELL_CONFIG=""
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_CONFIG="$HOME/.bash_profile"
fi

# Check if already in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    if [ -n "$SHELL_CONFIG" ]; then
        if ! grep -q "\.falcon/bin" "$SHELL_CONFIG" 2>/dev/null; then
            echo "" >> "$SHELL_CONFIG"
            echo '# Falcon' >> "$SHELL_CONFIG"
            echo 'export PATH="$HOME/.falcon/bin:$PATH"' >> "$SHELL_CONFIG"
            echo -e "${YELLOW}Added Falcon to PATH in $SHELL_CONFIG${NC}"
        fi
    fi
fi

echo ""
echo -e "${GREEN}Falcon installed successfully!${NC}"
echo ""
echo "To get started:"
echo "  1. Set your API key:  export FAL_KEY=\"your-key\""
echo "  2. Restart your shell or run:  source $SHELL_CONFIG"
echo "  3. Generate an image:  falcon \"a sunset over mountains\""
echo ""
echo "Get your API key at: https://fal.ai/dashboard/keys"
