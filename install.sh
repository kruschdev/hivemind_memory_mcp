#!/usr/bin/env bash

set -e

echo "========================================"
echo "🧠 Installing Krusch Memory MCP Server..."
echo "========================================"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js v18+ and try again."
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed. Please install npm and try again."
    exit 1
fi

echo "📦 Installing 'krusch-memory-mcp' globally from npm..."
npm install -g krusch-memory-mcp

echo ""
echo "========================================"
echo "✅ Installation Complete!"
echo "========================================"
echo ""
echo "You can now run the MCP server via the command:"
echo "  krusch-memory"
echo ""
echo "To add it to Claude Desktop, add the following to your claude_desktop_config.json:"
echo ""
echo "{"
echo "  \"mcpServers\": {"
echo "    \"krusch-memory\": {"
echo "      \"command\": \"krusch-memory\","
echo "      \"args\": [],"
echo "      \"env\": {"
echo "        \"DB_MODE\": \"sqlite\","
echo "        \"OLLAMA_URL\": \"http://localhost:11434\","
echo "        \"EMBED_MODEL\": \"nomic-embed-text\""
echo "      }"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "Please ensure you have Ollama running with 'nomic-embed-text' pulled:"
echo "  ollama run nomic-embed-text"
echo ""
