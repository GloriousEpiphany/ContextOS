#!/bin/bash
# ContextPrompt AI — Native Messaging Host Installer (macOS / Linux)

HOST_NAME="com.contextprompt.ai"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST_FILE="$SCRIPT_DIR/manifest.json"

# Determine target directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

mkdir -p "$TARGET_DIR"

# Create manifest with absolute path
cat > "$TARGET_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "ContextPrompt AI Native Messaging Host for MCP protocol bridge",
  "path": "$SCRIPT_DIR/index.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://__MSG_@@extension_id__/"
  ]
}
EOF

chmod +x "$SCRIPT_DIR/index.js"

echo "Native Messaging Host installed."
echo "  Host: $HOST_NAME"
echo "  Manifest: $TARGET_DIR/$HOST_NAME.json"
echo "  Script: $SCRIPT_DIR/index.js"
