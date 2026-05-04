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

打开 arXiv / OpenReview / CVPR 论文页面，30 秒后自动入库。
- 标题、作者、abstract、引用图谱（来自 Semantic Scholar）
- 自动关联 GitHub 实现 repo（识别 README 内的 arXiv ID）
- OpenReview 论文显示评审分数与 meta-review

### 2. 一键接入 Claude Desktop / Cursor

ContextOS 暴露 MCP server。安装后在 Claude Desktop 里直接问：
> 上周读的那篇 contrastive learning 论文里 ablation 部分是怎么做的？

Claude 通过 MCP 协议从你的本地知识图谱取上下文回答。**你不需要复制粘贴。**

### 3. AI 讨论自动归档（可选 · 默认关闭）

可在设置里开启对 ChatGPT / Claude / Qwen 网页的对话观察。开启后：
- 你和 AI 讨论的论文 / 概念被本地索引（PII 自动脱敏）
  - 三个月后再问类似问题，ContextOS 提示"你之前讨论过 X，结论是 Y"

- 数据全本地，无云端上传

### 4. 跨 AI 平台注入

12 个 AI 平台的输入框上多一个 "Inject Context" 按钮：
ChatGPT · Claude · Gemini · DeepSeek · Qwen · 豆包 · Poe · Perplexity · Copilot · HuggingChat · Mistral · Grok

点击 → ContextOS 在本地知识图谱里搜相关 paper / 笔记 / 历史讨论 → 按目标模型 token 预算压缩 → 注入。

### 5. Sprint 进度仪表盘 (新)

Sidepanel 里可见 N=1 → N=5 装机进度、当周 reading volume、MCP 连接状态。给认真做 dogfood 的人。

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
2. 「加载已解压的扩展程序→ 选择 `.output/chrome-mv3`

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
