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

Open arXiv / OpenReview / CVPR / ICCV / ECCV paper pages and stay for 30 seconds; ContextOS ingests the paper automatically.

- arXiv abs / pdf / html pages: title, authors, abstract, arXiv ID, PDF URL
- OpenReview forum pages: title, authors, abstract, review scores, confidence, meta-review / decision text
- CVF openaccess pages: CVPR / ICCV / ECCV paper detection
- Semantic Scholar enrichment: citation count, influential citation count, reference graph, citation graph, open-access PDF URL
- GitHub repo linking: detects arXiv IDs in GitHub READMEs and links implementation repos back to papers

### 2. One-click Claude Desktop / Cursor connection

ContextOS exposes an MCP server. After install, just ask in Claude Desktop:
> What was the ablation in that contrastive learning paper I read last week?

Claude pulls context from your local knowledge graph via MCP. **No copy-paste.**

Current MCP tools include:

- `search_papers`: search local papers by topic / author / arXiv ID / OpenReview metadata
- `get_paper_context`: return paper metadata, abstract, S2 citation graph, OpenReview meta-review, GitHub repo, and past discussion context
- `list_recent_papers`: list recently read papers
- General knowledge graph tools: search, list contexts, stats, screenshot / image extraction, and related utilities

### 3. AI conversation archiving (optional · default OFF)

Enable in Settings to observe ChatGPT / Claude / Qwen web conversations. When on:
- Papers and concepts you discuss with AI get indexed locally (PII auto-redacted)
- Three months later, ContextOS reminds you: "you discussed X before; conclusion was Y"
- All local, no cloud upload

### 4. Cross-AI injection

A "Inject Context" button on 12 AI platform input fields:
ChatGPT · Claude · Gemini · DeepSeek · Qwen · Doubao · Poe · Perplexity · Copilot · HuggingChat · Mistral · Grok

Click → ContextOS searches relevant papers / notes / past discussions in your local KG → compresses to fit the model's token budget → injects.

Injection is not a static template: the button reads your current input as the query, calls the local context orchestrator, compresses paper / note / chat history to the target platform's token budget, then inserts a ready-to-send context package.

### 5. Sprint dashboard (new)

The sidepanel shows N=1 → N=5 install progress, weekly reading volume, MCP connection status. For people who actually dogfood.

---

## Notion / external MCP status

ContextOS can be read as an MCP server by Claude Desktop / Cursor / Codex and other MCP clients; that path is implemented for exposing the local paper knowledge graph to AI tools.

Notion's official MCP is a separate external remote MCP server. The official recommended URL is:

```text
https://mcp.notion.com/mcp
```

Per Notion's official documentation, Notion MCP requires OAuth 2.0 Authorization Code + PKCE, token refresh, and secure credential storage. ContextOS **does not pretend to be a completed in-extension Notion OAuth client**:

- Supported: add external MCP server URLs in Settings, with explicit diagnostics for the official Notion URL
- Supported: guide users to connect Notion through Claude Desktop / Cursor / ChatGPT Connectors / Codex MCP login
- Supported: use `mcp-remote` when a client only supports local stdio MCP servers
- Not yet supported: completing Notion OAuth + PKCE inside the Chrome extension and importing Notion pages directly into ContextOS

Recommended configuration:

```json
{
  "mcpServers": {
    "notion": {
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

Claude Desktop currently adds remote MCP through Settings → Connectors; Cursor can add the same URL in MCP settings. For headless automation, Notion's docs state that remote MCP does not support bearer-token auth and requires a human OAuth authorization flow.

References: Notion Docs — [Connecting to Notion MCP](https://developers.notion.com/guides/mcp/get-started-with-mcp) / [Integrating your own MCP client](https://developers.notion.com/guides/mcp/build-mcp-client).

---

## Completion audit

| Goal | Status | Notes |
|---|---:|---|
| Auto-ingest arXiv / OpenReview / CVPR after 30 seconds | Implemented | Dedicated content script timer; cancels when the page is hidden |
| Title, authors, abstract | Implemented | arXiv / OpenReview / CVF detectors; arXiv PDF has ID fallback |
| Semantic Scholar citation graph | Implemented | Stores references / citations; exposed through MCP paper context |
| GitHub implementation repo auto-linking | Implemented | Detects arXiv IDs in GitHub README and writes back to the paper |
| OpenReview scores and meta-review | Implemented | Badge and paper context both include review summary |
| Claude Desktop / Cursor MCP access to local KG | Implemented | Native Host + MCP tools |
| AI discussion archiving | Implemented, default OFF | Currently covers ChatGPT / Claude / Qwen with local PII redaction |
| 12-platform Inject Context | Implemented | Assembles context by platform model budget and injects into the input field |
| Direct Notion import | Not claimed complete | External MCP URL / diagnostics are supported; direct OAuth import remains future work |

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

Development verification:

```bash
npm test
npm run check
npm run build
```

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

Connect to Cursor: add the local ContextOS MCP server in Cursor Settings → MCP. If you also want Notion, add `https://mcp.notion.com/mcp` separately and complete Notion OAuth.

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
