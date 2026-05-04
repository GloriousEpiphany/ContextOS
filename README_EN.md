<div align="center">

<h1>ContextOS</h1>

**Browser-native paper workflow for ML / CV / AI / NLP researchers.**

Read arXiv, capture automatically. Discuss with ChatGPT, archive automatically.
Connect to Claude Desktop, query your local knowledge graph.
No more "I read that paper last week but I can't find it."

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE) · [License FAQ (MCP / commercial)](./LICENSE.md)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Svelte 5](https://img.shields.io/badge/Svelte-5-orange)

English · [中文](./README.md)

</div>

---

## Who this is for

You're a PhD / MS / industry researcher reading 10-15 papers a week, juggling
PDFs + ChatGPT/Claude conversations + GitHub repos. You've noticed:

- Your notes are scattered across Notion / Obsidian / Excel / local markdown — unfindable
- Discussing a paper with AI means copy-pasting paragraphs; three months later the AI has forgotten everything
- Papers and their GitHub repos never auto-link

ContextOS stitches the broken workflow back together.
**Not another paper manager — a local knowledge layer that plugs what you've read into any AI.**

---

## What it does

### 1. Browse-as-capture

Open arXiv / OpenReview / CVPR pages, auto-ingest after 30 seconds.
- Title, authors, abstract, citation graph (via Semantic Scholar)
- Auto-link to GitHub implementation repos (detects arXiv IDs in READMEs)
- Show OpenReview review scores + meta-review inline

### 2. One-click Claude Desktop / Cursor connection

ContextOS exposes an MCP server. After install, just ask in Claude Desktop:
> What was the ablation in that contrastive learning paper I read last week?

Claude pulls context from your local knowledge graph via MCP. **No copy-paste.**

### 3. AI conversation archiving (optional · default OFF)

Enable in Settings to observe ChatGPT / Claude / Qwen web conversations. When on:
- Papers and concepts you discuss with AI get indexed locally (PII auto-redacted)
- Three months later, ContextOS reminds you: "you discussed X before; conclusion was Y"
- All local, no cloud upload

### 4. Cross-AI injection

A "Inject Context" button on 12 AI platform input fields:
ChatGPT · Claude · Gemini · DeepSeek · Qwen · Doubao · Poe · Perplexity · Copilot · HuggingChat · Mistral · Grok

Click → ContextOS searches relevant papers / notes / past discussions in your local KG → compresses to fit the model's token budget → injects.

### 5. Sprint dashboard (new)

The sidepanel shows N=1 → N=5 install progress, weekly reading volume, MCP connection status. For people who actually dogfood.

---

## 30-day goal

This is an N=1 → N=5 validation sprint. We're not selling subscriptions, claiming PMF, or doing a launch tweet. Right now:

- ≥ 5 researchers outside our lab install + use for ≥ 7 days
- ≥ 2 send back specific feature requests
- Real data decides whether we pivot toward "Personal Research MCP Server"

If you try it, **your feedback is invaluable**. File an issue or DM the founder.

---

## Install

### Chrome Web Store
Coming soon. Meanwhile, dev-mode install works.

### Dev mode

Requires Node.js ≥ 18 · Chrome ≥ 120 (138+ recommended for Gemini Nano).

```bash
git clone https://github.com/GloriousEpiphany/ContextOS.git
cd ContextOS
npm install
npm run build
```

Load into Chrome:
1. Open `chrome://extensions` → enable Developer Mode
2. "Load unpacked" → select `.output/chrome-mv3`

### Enable MCP server (recommended · for Claude Desktop / Cursor)

Requires Node.js on PATH.

```bash
# Windows (admin)
cd native-host && install.bat

# macOS / Linux
cd native-host && chmod +x install.sh && ./install.sh
```

The script asks for your Extension ID (visible in `chrome://extensions` dev mode).

Connect to Claude Desktop: the extension's onboarding page has an "Install MCP entry" one-click button that writes the Claude Desktop config (backs up the existing config to `.bak`; refuses to overwrite if corrupted). Manual instructions in [LICENSE.md](./LICENSE.md).

---

## Tech stack

| Layer | Tech |
|---|---|
| Framework | TypeScript + Svelte 5 + WXT (Vite) |
| Storage | Dexie.js (IndexedDB) + chrome.storage.local |
| Search | MiniSearch (BM25) + Transformers.js (all-MiniLM-L6-v2 vectors) |
| Visualization | D3.js force-directed graph |
| Design system | Tailwind CSS 4 + DESIGN.md tokens (Fraunces / Instrument Sans / Geist / JetBrains Mono · SIL OFL) |
| Protocol | MCP (JSON-RPC 2.0) + Chrome Native Messaging |
| AI | 3-tier routing: Gemini Nano → Cloud APIs → Rule NLP |
| Extension | Chrome Manifest V3, Service Worker |

See [DESIGN.md](./DESIGN.md) (design system) and [LICENSE.md](./LICENSE.md) (AGPL × MCP stance).

---

## Privacy

- **Local-first**: All data lives in your browser (IndexedDB + chrome.storage.local)
- **Vector embeddings**: Computed in-browser; model is downloaded from CDN once and cached
- **AI calls**: Only when you trigger them, sent to your configured provider, API key stored locally
- **MCP server**: Listens only on `127.0.0.1`, never exposed to the network
- **AI conversation observer (Exp #5)**: Default OFF. When on, all data local, no cloud upload, PII (emails / API tokens / phone numbers) auto-redacted before storage

No telemetry, no fingerprinting. Chrome Web Store install count is the only number we currently see.

---

## License

[GNU AGPL-3.0-only](./LICENSE) — free to use, modify, self-host. AGPL × MCP relationship detailed in [LICENSE.md](./LICENSE.md): **connecting to ContextOS via the MCP protocol does NOT create an AGPL derivative work**; commercial AI clients are free to use it.

---

<div align="center">

Built for builders who read papers.

</div>
