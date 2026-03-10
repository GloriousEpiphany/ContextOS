# ContextPrompt AI v4.0

<p align="center">
  <img src="promo/contextprompt-ai.png" alt="ContextPrompt AI" width="440">
</p>

**Intelligent Knowledge Management & AI Context Orchestration Chrome Extension** — Capture web content, build a personal knowledge graph, and seamlessly inject knowledge into any AI conversation via semantic search and the MCP protocol.

[中文文档](./README.md)

---

## Feature Overview

### Core Capabilities

- **Knowledge Graph** — Automatically builds a knowledge network with semantic relations, tag overlap, and domain associations. Visualized with D3 force-directed graphs
- **Hybrid Search** — Vector embeddings (all-MiniLM-L6-v2, 384 dims) + BM25 keyword search, fused with Reciprocal Rank Fusion (RRF)
- **Three-Level AI Routing** — Chrome Gemini Nano (local) → Cloud API (OpenAI/Anthropic/DeepSeek/Qwen) → Rule-based NLP fallback
- **Context Orchestration** — Automatically assembles knowledge graph + current page + user query into a structured context package with adaptive token budgeting
- **Selection Toolbar** — Floating toolbar appears on text selection: Save to Knowledge Base / AI Summarize / Translate / Copy as Markdown
- **MCP Protocol** — Exposes 5 MCP Tools via Native Messaging Host, callable by Claude Desktop / Cursor / etc.
- **Workflow Engine** — Preset multi-step workflows for academic research, competitive analysis, code review — one-click execution

### Smart Capture

- One-click page capture (title, URL, main content, metadata, JSON-LD)
- Right-click menu to save directly to knowledge graph
- Batch capture all tabs in current window
- AI chat history extraction (ChatGPT, Claude, Gemini, DeepSeek, and 10+ platforms)
- Auto-capture by URL pattern with notification confirmation
- Keyboard shortcuts: `Ctrl+Shift+C` capture / `Ctrl+Shift+P` generate prompt

### AI Integration

| Provider | Models | Use Cases |
|----------|--------|-----------|
| OpenAI | gpt-4o, gpt-4o-mini | Summarization, translation, quality analysis |
| Anthropic | Claude Sonnet 4, Claude Haiku 4 | Summarization, context fusion |
| DeepSeek | deepseek-chat, deepseek-reasoner | Summarization, reasoning |
| Qwen | qwen-turbo, qwen-plus, qwen-max | Summarization, translation |
| Chrome Gemini Nano | Built-in | Local offline summarization (EN/ES/JA) |
| Custom | Any OpenAI-compatible API | Self-hosted models |

### MCP Ecosystem

Exposes extension capabilities as MCP tools via a Native Messaging Host (Node.js):

| Tool | Description |
|------|-------------|
| `search_knowledge` | Semantic search over the knowledge graph |
| `get_context` | Assemble a context package for a target model |
| `capture_page` | Capture the current browser tab |
| `list_knowledge` | List recent knowledge nodes |
| `get_stats` | Knowledge graph statistics |

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Chrome >= 120 (138+ recommended for Gemini Nano support)
- npm or pnpm

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/GloriousEpiphany/ContextOS.git contextprompt-ai
cd contextprompt-ai

# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Production build
npm run build

# Type checking
npm run check

# Package as zip
npm run zip
```

### Load into Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `.output/chrome-mv3` directory

### Enable MCP Server (Optional)

```bash
# Register Native Messaging Host
# Windows:
cd native-host && install.bat

# macOS / Linux:
cd native-host && chmod +x install.sh && ./install.sh

# MCP Server listens on http://127.0.0.1:19960 by default
# Test with curl:
curl -X POST http://127.0.0.1:19960 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | TypeScript + Svelte 5 + WXT (Vite) |
| Storage | Dexie.js (IndexedDB) + Chrome Storage API |
| Search | MiniSearch (BM25) + Transformers.js (vector embeddings, CDN-loaded) |
| Visualization | D3.js force-directed graph |
| Styling | Tailwind CSS 4 |
| Protocol | MCP (JSON-RPC 2.0) + Chrome Native Messaging |
| AI | Three-level routing: Gemini Nano → Cloud APIs → Rule NLP |

---

## Project Structure

```
contextprompt-ai/
├── src/
│   ├── types/index.ts                    # Global type definitions
│   ├── entrypoints/
│   │   ├── background.ts                # Service Worker (message hub)
│   │   ├── capture.content.ts           # Page capture content script
│   │   ├── selection-toolbar.content.ts  # Text selection toolbar
│   │   ├── popup/                       # Popup UI (Svelte)
│   │   ├── sidepanel/                   # Side Panel UI (Svelte)
│   │   ├── onboarding/                  # Onboarding wizard
│   │   └── offscreen/                   # Offscreen Document (embeddings)
│   └── lib/
│       ├── ai/
│       │   ├── router.ts               # Three-level AI routing engine
│       │   ├── cloud-engine.ts          # Multi-provider cloud AI
│       │   ├── local-engine.ts          # Chrome Gemini Nano
│       │   └── embeddings.ts            # Transformers.js vector embeddings
│       ├── storage/
│       │   ├── db.ts                    # Dexie database schema
│       │   ├── vector-store.ts          # Vector store & cosine similarity search
│       │   ├── knowledge-graph.ts       # Knowledge graph CRUD + relation discovery
│       │   └── search.ts               # Hybrid search (RRF fusion)
│       ├── context/
│       │   ├── budget.ts               # Token budget management
│       │   ├── compressor.ts           # Context compression
│       │   └── orchestrator.ts         # Context orchestrator
│       ├── mcp/
│       │   ├── protocol.ts             # MCP protocol types
│       │   ├── server-tools.ts         # MCP Server tool definitions
│       │   └── client.ts              # MCP Client (call external servers)
│       ├── workflow/
│       │   ├── engine.ts              # Workflow execution engine
│       │   └── templates.ts           # Preset workflow templates
│       ├── components/
│       │   ├── KnowledgeGraph.svelte  # D3 knowledge graph visualization
│       │   └── WorkflowPanel.svelte   # Workflow management panel
│       ├── nlp-engine.ts              # Rule-based NLP
│       └── prompt/templates.ts        # Prompt templates
├── native-host/
│   ├── index.js                       # Native Messaging Host (MCP bridge)
│   ├── manifest.json                  # Host manifest
│   ├── install.bat                    # Windows registration script
│   └── install.sh                     # macOS/Linux registration script
├── wxt.config.ts                      # WXT build configuration
├── package.json
└── tsconfig.json
```

---

## Usage

### Basic Usage

1. **Capture Context** — Visit a webpage → Click the extension icon → "Capture Current Page"
2. **Text Selection** — Select text on any page → Floating toolbar appears → Save / Summarize / Translate / Copy
3. **Knowledge Search** — Type in the side panel search box for hybrid semantic + keyword search
4. **Context Orchestration** — Automatically assembles knowledge graph context for AI conversations
5. **Run Workflows** — Side panel Workflow tab → Select a preset → Execute with one click

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Capture current page | `Ctrl+Shift+C` / `Cmd+Shift+C` |
| Generate prompt | `Ctrl+Shift+P` / `Cmd+Shift+P` |

### AI Configuration

1. Click extension icon → Settings
2. Enable AI → Select provider → Enter API Key
3. Optional: Enable auto-summarization, configure MCP Server

---

## Privacy

### Local Mode (Default)
- All data stored locally in the browser (IndexedDB + Chrome Storage)
- Vector embeddings computed in-browser (Transformers.js; model downloaded from CDN on first use, then cached locally)
- Apart from the initial model download, no external network requests and no data collection

### AI Enhanced Mode (Optional)
- Content sent to selected AI API only when enabled
- API keys stored locally
- Can be disabled at any time to return to pure local mode

### MCP Server (Optional)
- Listens only on `127.0.0.1` (localhost), not exposed to the network
- Requires manual Native Messaging Host installation

---

## Publishing

### Chrome Web Store
1. Run `npm run zip` to generate a `.zip` package
2. Visit [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload the zip, fill in store listing details, and submit for review

### Edge Add-ons
WXT supports Edge builds: `npx wxt build --browser edge`, then submit to the [Edge Developer Center](https://partner.microsoft.com/dashboard/microsoftedge/)

### Manual Distribution
Distribute the `.output/chrome-mv3` directory or the `.zip` file directly to users for loading via Developer Mode.

---

## Build Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode (hot reload + auto-refresh) |
| `npm run build` | Production build to `.output/chrome-mv3` |
| `npm run check` | TypeScript + Svelte type checking |
| `npm run zip` | Package as a publishable `.zip` |

---

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE).

In brief:
- You are free to use, modify, and distribute this software
- If you modify it and provide it as a network service, you must release your modified source code
- All derivative works must be licensed under the same AGPL-3.0

---

Made with ContextPrompt AI
