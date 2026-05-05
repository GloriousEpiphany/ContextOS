<div align="center">

<h1>ContextOS</h1>

**为 ML / CV / AI / NLP 研究者打造的浏览器原生论文工作流。**

读 arXiv，自动结构化；和 ChatGPT 讨论，自动归档；接 Claude Desktop，知识本地可查。
不再有"我上周看过那篇 paper 但找不到了"。

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE) · [License FAQ (MCP / 商用)](./LICENSE.md)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Svelte 5](https://img.shields.io/badge/Svelte-5-orange)

[English](./README_EN.md) · 中文

</div>

---

## 谁在用

如果你在博士 / 硕士 / 工业研究岗一周读 10-15 篇论文，同时开 PDF + ChatGPT/Claude 讨论 + GitHub repo 标签页，并发现：

- 笔记散在 Notion / Obsidian / Excel / 本地 markdown 各处，找不回来
- 和 AI 讨论过的论文要复制粘贴段落进对话，三个月后 AI 完全忘了
- 论文和它的 GitHub repo 不会自动建立联系

ContextOS 把这条断裂工作流缝起来。**不是又一个论文管理工具，是把你读过的东西接进任何 AI 的本地知识层。**

---

## 它做什么

### 1. 浏览即捕获

打开 arXiv / OpenReview / CVPR / ICCV / ECCV 论文页面，停留 30 秒后自动入库。

- arXiv abs / pdf / html 页面：提取标题、作者、abstract、arXiv ID、PDF URL
- OpenReview forum 页面：提取标题、作者、abstract、评审分数、confidence、meta-review / decision 文本
- CVF openaccess 页面：识别 CVPR / ICCV / ECCV 论文页
- Semantic Scholar enrichment：补充 citation count、influential citation count、reference graph、citation graph、开放 PDF URL
- GitHub repo 关联：在 GitHub README 中识别 arXiv ID，把实现 repo 写回对应 paper

### 2. 一键接入 Claude Desktop / Cursor

ContextOS 暴露 MCP server。安装后在 Claude Desktop 里直接问：
> 上周读的那篇 contrastive learning 论文里 ablation 部分是怎么做的？

Claude 通过 MCP 协议从你的本地知识图谱取上下文回答。**你不需要复制粘贴。**

当前 MCP server 提供：

- `search_papers`：按主题 / 作者 / arXiv ID / OpenReview 信息检索本地论文
- `get_paper_context`：返回论文、abstract、S2 引用图谱、OpenReview meta-review、GitHub repo、历史讨论上下文
- `list_recent_papers`：列出最近读过的论文
- 通用 knowledge graph 工具：搜索、列上下文、取统计、截图 / 图片抽取等

### 3. AI 讨论自动归档（可选 · 默认关闭）

可在设置里开启对 ChatGPT / Claude / Qwen 网页的对话观察。开启后：
- 你和 AI 讨论的论文 / 概念被本地索引（PII 自动脱敏）
  - 三个月后再问类似问题，ContextOS 提示"你之前讨论过 X，结论是 Y"

- 数据全本地，无云端上传

### 4. 跨 AI 平台注入

12 个 AI 平台的输入框上多一个 "Inject Context" 按钮：
ChatGPT · Claude · Gemini · DeepSeek · Qwen · 豆包 · Poe · Perplexity · Copilot · HuggingChat · Mistral · Grok

点击 → ContextOS 在本地知识图谱里搜相关 paper / 笔记 / 历史讨论 → 按目标模型 token 预算压缩 → 注入。

注入不是固定模板：按钮会读取当前输入框内容作为 query，调用本地 context orchestrator，按目标平台模型预算压缩 paper / note / chat history，再插入可直接发送的上下文包。

### 5. Sprint 进度仪表盘 (新)

Sidepanel 里可见 N=1 → N=5 装机进度、当周 reading volume、MCP 连接状态。给认真做 dogfood 的人。

---

## Notion / 外部 MCP 接入状态

ContextOS 可以作为 MCP server 被 Claude Desktop / Cursor / Codex 等客户端读取；这条路径已经用于把本地论文知识图谱接进 AI 工具。

Notion 官方 MCP 是另一条外部 remote MCP server，官方推荐地址是：

```text
https://mcp.notion.com/mcp
```

根据 Notion 官方文档，Notion MCP 需要 OAuth 2.0 Authorization Code + PKCE、token refresh 和安全凭据存储。当前 ContextOS **不会伪装成已完成的 Notion OAuth 客户端**：

- 已支持：在设置里添加外部 MCP server URL，并对 Notion 官方 URL 给出明确诊断
- 已支持：提示你使用 Claude Desktop / Cursor / ChatGPT Connectors / Codex 自身 MCP 登录来连接 Notion
- 已支持：对只支持 stdio 的工具，可使用 `mcp-remote` 桥接 Notion remote MCP
- 尚未支持：在 Chrome 扩展内部直接完成 Notion OAuth + PKCE 并把 Notion 页面完美导入 ContextOS

推荐路径：

```json
{
  "mcpServers": {
    "notion": {
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

Claude Desktop 当前通过 Settings → Connectors 添加 remote MCP；Cursor 可在 MCP 设置里添加以上 URL。需要无头自动化时，Notion 官方说明 remote MCP 不支持 bearer token，必须有人完成 OAuth 授权。

参考：Notion Docs — [Connecting to Notion MCP](https://developers.notion.com/guides/mcp/get-started-with-mcp) / [Integrating your own MCP client](https://developers.notion.com/guides/mcp/build-mcp-client)。

---

## 当前完成度审查

| 目标 | 状态 | 说明 |
|---|---:|---|
| 浏览 arXiv / OpenReview / CVPR 30 秒自动入库 | 已实现 | 独立 content script 计时入库，页面隐藏时取消 |
| 标题、作者、abstract | 已实现 | arXiv / OpenReview / CVF 检测器覆盖，arXiv PDF 有 ID fallback |
| Semantic Scholar 引用图谱 | 已实现 | 存储 references / citations，MCP context 中可读 |
| GitHub 实现 repo 自动关联 | 已实现 | GitHub README arXiv ID 检测并写回 paper |
| OpenReview 分数与 meta-review | 已实现 | badge 和 paper context 都包含 review summary |
| Claude Desktop / Cursor MCP 读取本地 KG | 已实现 | Native Host + MCP tools |
| AI 讨论自动归档 | 已实现，默认关闭 | 目前覆盖 ChatGPT / Claude / Qwen，PII 脱敏后本地索引 |
| 12 平台 Inject Context | 已实现 | 按平台模型预算组装上下文并注入输入框 |
| Notion 直接导入 | 未声称完成 | 外部 MCP URL / 诊断已支持；直接 OAuth 导入仍是后续工作 |

---

## 30 天目标

这是个 N=1 → N=5 验证 sprint。我们不卖订阅、不做 PMF claim、不发 launch tweet。当前阶段是：

- ≥ 5 个实验室外的研究者装上并连续使用 ≥ 7 天
- ≥ 2 个回来主动反馈具体功能请求
- 用真实数据决定是否 pivot 到 "Personal Research MCP Server" 方向

如果你试用，**主动反馈对我们价值无限**。开 issue 或私信 founder 都行。

---

## 安装

### Chrome Web Store
即将上架。同期可走开发者模式手动加载。

### 开发模式

环境：Node.js ≥ 18 · Chrome ≥ 120（推荐 138+ 以启用 Gemini Nano）。

```bash
git clone https://github.com/GloriousEpiphany/ContextOS.git
cd ContextOS
npm install
npm run build
```

加载到 Chrome：
1. 打开 `chrome://extensions` → 开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`

开发校验：

```bash
npm test
npm run check
npm run build
```

### 启用 MCP Server（推荐 · 接 Claude Desktop / Cursor）

需要 Node.js 在 PATH。

```bash
# Windows（管理员）
cd native-host && install.bat

# macOS / Linux
cd native-host && chmod +x install.sh && ./install.sh
```

安装脚本会要求 Extension ID（在 `chrome://extensions` 开发者模式下可见）。

接入 Claude Desktop：扩展 onboarding 页有「Install MCP entry」一键按钮，自动写入 Claude Desktop 的 config（先备份原 config 到 `.bak`，损坏时不覆盖）。手动方式在 LICENSE FAQ 里。

接入 Cursor：在 Cursor Settings → MCP 中添加本地 ContextOS MCP server；如果你要同时连接 Notion，请额外添加 `https://mcp.notion.com/mcp` 并完成 Notion OAuth。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | TypeScript + Svelte 5 + WXT (Vite) |
| 存储 | Dexie.js (IndexedDB) + chrome.storage.local |
| 搜索 | MiniSearch (BM25) + Transformers.js (all-MiniLM-L6-v2 向量) |
| 可视化 | D3.js 力导向图 |
| 设计系统 | Tailwind CSS 4 + DESIGN.md tokens（Fraunces / Instrument Sans / Geist / JetBrains Mono · SIL OFL） |
| 协议 | MCP (JSON-RPC 2.0) + Chrome Native Messaging |
| AI | 三级路由：Gemini Nano → Cloud APIs → Rule NLP |
| 扩展 | Chrome Manifest V3，Service Worker |

详见 [DESIGN.md](./DESIGN.md)（设计系统）和 [LICENSE.md](./LICENSE.md)（AGPL × MCP 立场）。

---

## 隐私

- **本地优先**：所有数据存浏览器本地（IndexedDB + chrome.storage.local）
- **向量嵌入**：浏览器内计算，模型首次从 CDN 下载后缓存
- **AI 调用**：仅在你主动触发时，按你配置的提供商发送，API Key 本地存储
- **MCP server**：仅监听 `127.0.0.1`，不暴露公网
- **AI 对话观察 (Exp #5)**：默认关闭。开启时所有数据本地，无云端上传，PII（email / API token / 电话）自动脱敏后再写入 KG

无遥测，无 fingerprint。Chrome Web Store 后台的安装数是当前我们能看到的唯一数字。

---

## License

[GNU AGPL-3.0-only](./LICENSE) — 你可自由使用、修改、自托管。AGPL × MCP 关系详见 [LICENSE.md](./LICENSE.md)：**通过 MCP 协议接入 ContextOS 不构成 AGPL 派生作品**，商业 AI client 可自由使用。

---

<div align="center">

Built for builders who read papers.

</div>
