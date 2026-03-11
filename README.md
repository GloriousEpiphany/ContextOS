<div align="center">

<h1>ContextOS</h1>

**你的浏览器里藏着一座知识金矿。ContextOS 帮你挖出来。**

捕获网页内容，构建个人知识图谱，通过语义搜索与 MCP 协议
将知识无缝注入任何 AI 对话 — 一切在浏览器本地运行。

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Svelte 5](https://img.shields.io/badge/Svelte-5-orange)

[English](./README_EN.md) · 中文

</div>

---

## 它做什么

ContextOS 是一个 Chrome 扩展，把你的日常浏览转化为结构化、可搜索的知识库，并让这些知识随时可用于任何 AI 对话。

- **捕获** 一键抓取网页内容（或按 URL 模式自动捕获）
- **构建** — 自动发现语义关系，生成知识图谱
- **搜索** — 向量嵌入 + BM25 关键词混合检索，RRF 融合排序
- **注入** — 将组装好的上下文插入 ChatGPT、Claude、Gemini、DeepSeek 等 12 个 AI 平台
- **暴露** — 通过 MCP 协议将知识库开放给 Claude Desktop / Cursor 等外部工具

本地优先，AI 功能可选，密钥自备。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  Content Scripts                                        │
│  ┌──────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ 页面捕获 │  │  选中文本工具栏  │  │  AI 按钮注入  │ │
│  │ 3 种深度 │  │ 保存/摘要/翻译/  │  │  12 个平台    │ │
│  │          │  │ 复制为 Markdown  │  │  Craft Prompt │ │
│  └────┬─────┘  └────────┬─────────┘  └───────┬───────┘ │
└───────┼────────────────┼──────────────────┼─────────────┘
        │                │                  │
        ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│  Background Service Worker（消息中枢）                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐│
│  │ AI 路由  │  │ 知识图谱 │  │   上下文编排器         ││
│  │ 三级回退 │  │  CRUD    │  │   Token 预算 + 压缩    ││
│  └──────────┘  └──────────┘  └────────────────────────┘│
└─────────────────────────────────────────────────────────┘
        │                │                  │
        ▼                ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────────┐
│ Dexie.js     │ │ Offscreen    │ │ Native Host       │
│ IndexedDB    │ │ Transformers │ │ MCP 桥接          │
│ 5 张表      │ │ .js 向量嵌入 │ │ JSON-RPC 2.0      │
└──────────────┘ └──────────────┘ └───────────────────┘
```

---

## 功能详解

### 知识捕获

| 功能 | 说明 |
|------|------|
| 一键捕获 | 标题、URL、正文、元数据、Open Graph、JSON-LD |
| 三种捕获深度 | 轻量（省 Token）· 标准 · 深度（完整内容） |
| 批量捕获 | 一键抓取当前窗口所有标签页 |
| AI 聊天提取 | ChatGPT、Claude、Gemini、DeepSeek、Qwen、豆包、Poe、Perplexity、Copilot、HuggingChat、Mistral、Grok |
| 选中文本工具栏 | 选中文字 → 浮动栏 → 保存 / AI 摘要 / 翻译 / 复制为 Markdown |
| 自动捕获 | URL 模式匹配 + 通知确认 |
| 快捷键 | `Ctrl+Shift+C` 捕获 · `Ctrl+Shift+P` 生成提示词 |
| 右键菜单 | 捕获页面 / 选中文本 / 链接 |

### 知识图谱

- NLP 关键词提取自动打标签（TF-IDF 评分，中英文停用词）
- 向量嵌入：all-MiniLM-L6-v2（384 维），通过 Transformers.js 在浏览器内计算（Offscreen Document）
- 关系发现：语义相似度、URL 域名、标签重叠（Jaccard）、时间邻近
- D3.js 力导向图可视化，支持交互式节点选择与操作（查看详情 / 删除）
- 混合搜索：向量相似度（60%）+ BM25 关键词（40%），Reciprocal Rank Fusion 融合

### AI 集成

三级路由，自动回退：

| 级别 | 引擎 | 触发条件 |
|------|------|----------|
| 1 | Chrome Gemini Nano | 可用且语言受支持（EN/ES/JA） |
| 2 | 云端 API | 用户配置了提供商 + API Key |
| 3 | 规则 NLP | 始终可用，无需 API |

支持的云端提供商：

| 提供商 | 示例模型 |
|--------|----------|
| OpenAI | gpt-4o, gpt-4o-mini |
| Anthropic | Claude Sonnet, Claude Haiku |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| 通义千问 | qwen-turbo, qwen-plus, qwen-max |
| 自定义 | 任意 OpenAI 兼容端点 |

AI 能力：摘要、翻译、质量分析、上下文融合、提示词优化。

### 上下文编排

点击 AI 平台上的「Craft Prompt」按钮时，ContextOS 会：

1. 在知识图谱中搜索相关节点
2. 纳入当前页面上下文
3. 按模型 Token 上限分配预算
4. 压缩并格式化为结构化上下文包
5. 在预览面板中展示，确认后插入 AI 聊天输入框

### AI 平台注入

「Craft Prompt」按钮注入到 12 个 AI 平台：

ChatGPT · Claude · Gemini · DeepSeek · Qwen · 豆包 · Poe · Perplexity · Copilot · HuggingChat · Mistral · Grok

Shadow DOM 隔离，零样式冲突。可在设置中关闭。

### MCP 协议

通过 Native Messaging Host 将知识库暴露给外部 AI 工具：

| Tool | 说明 |
|------|------|
| `search_knowledge` | 语义搜索知识图谱 |
| `get_context` | 为目标模型组装上下文包 |
| `capture_page` | 捕获当前浏览器标签页 |
| `list_knowledge` | 列出最近知识节点 |
| `get_stats` | 知识图谱统计信息 |

### 工作流引擎

预设多步工作流：

- **学术研究**：捕获 → 摘要 → 搜索知识库 → 生成上下文
- **竞品分析**：捕获 → 提取特征 → 对比 → 导出报告
- **代码审查**：捕获 → 分析 → 生成审查提示词
- **内容策展**：捕获 → 摘要 → 打标签 → 入库

### 界面

- **Popup**：快速捕获、上下文列表、搜索、多选融合、设置、历史
- **侧边栏**：知识浏览器、D3 图谱可视化、工作流执行、设置
- **引导页**：新用户三步引导
- **主题**：跟随系统 / 浅色 / 深色，Popup 与侧边栏同步
- **国际化**：English + 中文，运行时切换（无需重启浏览器）

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- Chrome ≥ 120（推荐 138+ 以支持 Gemini Nano）

### 安装与构建

```bash
git clone https://github.com/GloriousEpiphany/ContextOS.git
cd ContextOS

npm install
npm run dev      # 开发模式（热更新）
npm run build    # 生产构建
npm run check    # 类型检查
npm run zip      # 打包发布
```

### 加载到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions` → 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`

### 启用 MCP Server（可选）

需要 Node.js 已安装且在 PATH 中。

```bash
# Windows（需要管理员权限）
cd native-host && install.bat

# macOS / Linux
cd native-host && chmod +x install.sh && ./install.sh
```

安装脚本会提示输入你的 Extension ID（在 `chrome://extensions` 开发者模式下可见），然后自动生成 runner 脚本和 manifest。

安装完成后：
1. 在扩展设置中开启「MCP Server」
2. MCP Server 默认监听 `http://127.0.0.1:19960`（仅本地回环）

```bash
# 测试
curl -X POST http://127.0.0.1:19960 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | TypeScript + Svelte 5 + WXT (Vite) |
| 存储 | Dexie.js (IndexedDB) + Chrome Storage API |
| 搜索 | MiniSearch (BM25) + Transformers.js (向量嵌入, CDN 动态加载) |
| 可视化 | D3.js 力导向图 |
| 样式 | Tailwind CSS 4 + CSS 自定义属性主题系统 |
| 协议 | MCP (JSON-RPC 2.0) + Chrome Native Messaging |
| AI | 三级路由：Gemini Nano → Cloud APIs → Rule NLP |
| 扩展 | Chrome Manifest V3, Service Worker 架构 |

---

## 项目结构

```
contextprompt-ai/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts                 # Service Worker — 消息中枢，30+ 消息处理
│   │   ├── capture.content.ts            # 页面捕获（3 种深度，AI 聊天提取）
│   │   ├── selection-toolbar.content.ts   # 选中文本浮动工具栏
│   │   ├── injector.content.ts            # 12 个 AI 平台「Craft Prompt」按钮注入
│   │   ├── popup/App.svelte              # 扩展弹窗 UI
│   │   ├── sidepanel/App.svelte          # 侧边栏（知识库、图谱、工作流、设置）
│   │   ├── onboarding/App.svelte         # 新用户引导
│   │   └── offscreen/main.ts            # Offscreen Document（Transformers.js 嵌入计算）
│   └── lib/
│       ├── ai/
│       │   ├── router.ts                # 三级 AI 路由引擎
│       │   ├── cloud-engine.ts           # 多提供商云端 AI（OpenAI/Anthropic/DeepSeek/Qwen）
│       │   ├── local-engine.ts           # Chrome Gemini Nano 集成
│       │   └── embeddings.ts             # Transformers.js 向量嵌入（all-MiniLM-L6-v2）
│       ├── storage/
│       │   ├── db.ts                     # Dexie Schema（5 张表，v3→v4 迁移）
│       │   ├── knowledge-graph.ts        # 知识图谱 CRUD + 关系发现
│       │   ├── search.ts                 # 混合搜索（向量 + BM25，RRF 融合）
│       │   └── vector-store.ts           # 向量存储 + 余弦相似度
│       ├── context/
│       │   ├── orchestrator.ts           # 上下文编排器
│       │   ├── budget.ts                 # Token 预算管理（模型感知）
│       │   └── compressor.ts             # 上下文压缩
│       ├── mcp/
│       │   ├── protocol.ts              # MCP 协议类型定义（JSON-RPC 2.0）
│       │   ├── server-tools.ts           # 5 个 MCP Tools
│       │   └── client.ts               # MCP Client（调用外部 Server）
│       ├── workflow/
│       │   ├── engine.ts                # 多步工作流执行引擎
│       │   └── templates.ts              # 预设工作流模板
│       ├── components/
│       │   ├── KnowledgeGraph.svelte     # D3 力导向图组件
│       │   └── WorkflowPanel.svelte      # 工作流管理面板
│       ├── i18n.ts                       # 运行时国际化（切换语言无需重启）
│       ├── nlp-engine.ts                 # 规则 NLP（关键词提取、摘要、语言检测）
│       └── prompt/templates.ts           # 提示词模板引擎
├── native-host/
│   ├── index.js                          # MCP 桥接（Node.js HTTP ↔ Native Messaging）
│   ├── manifest.json                     # Native Host 注册清单
│   ├── install.bat                       # Windows 安装脚本
│   └── install.sh                        # macOS/Linux 安装脚本
├── _locales/
│   ├── en/messages.json                  # English（185 条）
│   └── zh/messages.json                  # 中文（185 条）
├── wxt.config.ts                         # WXT 构建配置 + Manifest
├── package.json
└── tsconfig.json
```

---

## 隐私保护

### 本地模式（默认）

- 所有数据存储在浏览器本地（IndexedDB + Chrome Storage）
- 向量嵌入在浏览器内计算（Transformers.js；模型首次使用时从 CDN 下载，后续从缓存加载）
- 除嵌入模型下载外，无任何外部网络请求，无遥测，无数据收集

### AI 增强模式（可选）

- 仅在你触发 AI 操作时，内容才会发送到你选择的提供商
- API Key 存储在本地 Chrome Storage
- 随时可关闭，回到纯本地模式

### MCP Server（可选）

- 仅监听 `127.0.0.1`（本地回环），不暴露到网络
- 需手动安装 Native Messaging Host

---

## License

[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE)

你可以自由使用、修改和分发本软件。如果你修改后通过网络提供服务，必须公开修改后的源代码，且衍生作品须使用相同许可证。

---

<div align="center">

Built with Svelte, TypeScript, and a mass of context.

</div>
