#!/bin/bash
# ContextPrompt AI — Native Messaging Host Installer (macOS / Linux)

HOST_NAME="com.contextprompt.ai"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Determine target directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

# ── Get Extension ID ──
echo ""
echo "To find your Extension ID:"
echo "  1. Open chrome://extensions"
echo "  2. Enable Developer Mode"
echo "  3. Find \"ContextPrompt AI\" and copy the ID"
echo ""

if [ -n "$1" ]; then
  EXT_ID="$1"
else
  read -rp "Enter your Chrome Extension ID: " EXT_ID
fi

if [ -z "$EXT_ID" ]; then
  echo "ERROR: Extension ID is required."
  echo "Usage: ./install.sh <extension-id>"
  exit 1
fi

mkdir -p "$TARGET_DIR"

# ── Create runner script ──
RUNNER="$SCRIPT_DIR/run.sh"
cat > "$RUNNER" << 'RUNNER_EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/index.js" "$@"
RUNNER_EOF
chmod +x "$RUNNER"

# ── Generate manifest with absolute path to runner ──
cat > "$TARGET_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "ContextPrompt AI Native Messaging Host for MCP protocol bridge",
  "path": "$RUNNER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo ""
echo "Native Messaging Host installed."
echo "  Host:       $HOST_NAME"
echo "  Manifest:   $TARGET_DIR/$HOST_NAME.json"
echo "  Runner:     $RUNNER"
echo "  Extension:  $EXT_ID"
echo ""
echo "Make sure 'node' is in your PATH."
echo "Enable 'MCP Server' in the extension settings to start using it."
