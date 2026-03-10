# ContextPrompt AI v4.0

<p align="center">
  <img src="promo/contextprompt-ai.png" alt="ContextPrompt AI" width="440">
</p>

**智能知识管理与 AI 上下文编排 Chrome 扩展** — 捕获网页内容，构建个人知识图谱，通过语义搜索与 MCP 协议将知识无缝注入任何 AI 对话。

[English Documentation](./README_EN.md)

---

## 功能概览

### 核心能力

- **知识图谱** — 自动构建带有语义关系、标签重叠、域名关联的知识网络，D3 力导向图可视化
- **混合搜索** — 向量嵌入（all-MiniLM-L6-v2, 384 维）+ BM25 关键词搜索，RRF 融合排序
- **三级 AI 路由** — Chrome Gemini Nano（本地） → 云端 API（OpenAI/Anthropic/DeepSeek/Qwen） → 规则 NLP 回退
- **上下文编排** — 自动组装知识图谱 + 当前页面 + 用户查询为结构化上下文包，Token 预算自适应
- **选中文本工具栏** — 选中文本后浮现操作栏：保存到知识库 / AI 摘要 / 翻译 / 复制为 Markdown
- **MCP 协议** — 通过 Native Messaging Host 暴露 5 个 MCP Tools，可被 Claude Desktop / Cursor 等调用
- **工作流引擎** — 预设学术研究、竞品分析、代码审查等多步工作流，一键执行

### 智能捕获

- 一键捕获页面（标题、URL、主要内容、元数据、JSON-LD）
- 右键菜单直接存入知识图谱
- 批量捕获当前窗口所有标签页
- AI 聊天记录提取（ChatGPT、Claude、Gemini、DeepSeek 等 10+ 平台）
- URL 模式自动捕获 + 通知确认
- 键盘快捷键 `Ctrl+Shift+C` 捕获 / `Ctrl+Shift+P` 生成提示词

### AI 集成

| 提供商 | 模型 | 用途 |
|--------|------|------|
| OpenAI | gpt-4o, gpt-4o-mini | 摘要、翻译、质量分析 |
| Anthropic | Claude Sonnet 4, Claude Haiku 4 | 摘要、上下文融合 |
| DeepSeek | deepseek-chat, deepseek-reasoner | 摘要、推理 |
| 通义千问 | qwen-turbo, qwen-plus, qwen-max | 摘要、翻译 |
| Chrome Gemini Nano | 内置 | 本地离线摘要（英/西/日） |
| 自定义 | 任意 OpenAI 兼容 API | 自托管模型 |

### MCP 生态

通过 Native Messaging Host（Node.js）将扩展能力暴露为 MCP 工具：

| Tool | 说明 |
|------|------|
| `search_knowledge` | 语义搜索知识图谱 |
| `get_context` | 组装上下文包（指定目标模型） |
| `capture_page` | 捕获当前浏览器标签页 |
| `list_knowledge` | 列出最近知识节点 |
| `get_stats` | 知识图谱统计信息 |

---

## 快速开始

### 环境要求

- Node.js >= 18
- Chrome >= 120（推荐 138+ 以支持 Gemini Nano）
- npm 或 pnpm

### 安装与开发

```bash
# 克隆仓库
git clone https://github.com/GloriousEpiphany/ContextOS.git contextprompt-ai
cd contextprompt-ai

# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 生产构建
npm run build

# 类型检查
npm run check

# 打包 zip
npm run zip
```

### 加载到 Chrome

1. 运行 `npm run build`
2. 打开 `chrome://extensions`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `.output/chrome-mv3` 目录

### 启用 MCP Server（可选）

```bash
# 注册 Native Messaging Host
# Windows:
cd native-host && install.bat

# macOS / Linux:
cd native-host && chmod +x install.sh && ./install.sh

# MCP Server 默认监听 http://127.0.0.1:19960
# 用 curl 测试：
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
| 样式 | Tailwind CSS 4 |
| 协议 | MCP (JSON-RPC 2.0) + Chrome Native Messaging |
| AI | 三级路由：Gemini Nano → Cloud APIs → Rule NLP |

---

## 项目结构

```
contextprompt-ai/
├── src/
│   ├── types/index.ts                    # 全局类型定义
│   ├── entrypoints/
│   │   ├── background.ts                # Service Worker（消息中枢）
│   │   ├── capture.content.ts           # 页面捕获 Content Script
│   │   ├── selection-toolbar.content.ts  # 选中文本操作栏
│   │   ├── popup/                       # 弹窗 UI (Svelte)
│   │   ├── sidepanel/                   # 侧边栏 UI (Svelte)
│   │   ├── onboarding/                  # 新用户引导
│   │   └── offscreen/                   # Offscreen Document（嵌入计算）
│   └── lib/
│       ├── ai/
│       │   ├── router.ts               # 三级 AI 路由引擎
│       │   ├── cloud-engine.ts          # 多提供商云端 AI
│       │   ├── local-engine.ts          # Chrome Gemini Nano
│       │   └── embeddings.ts            # Transformers.js 向量嵌入
│       ├── storage/
│       │   ├── db.ts                    # Dexie 数据库 Schema
│       │   ├── vector-store.ts          # 向量存储与余弦相似度搜索
│       │   ├── knowledge-graph.ts       # 知识图谱 CRUD + 关系发现
│       │   └── search.ts               # 混合搜索（RRF 融合）
│       ├── context/
│       │   ├── budget.ts               # Token 预算管理
│       │   ├── compressor.ts           # 上下文压缩
│       │   └── orchestrator.ts         # 上下文编排器
│       ├── mcp/
│       │   ├── protocol.ts             # MCP 协议类型
│       │   ├── server-tools.ts         # MCP Server Tools 定义
│       │   └── client.ts              # MCP Client（调用外部 Server）
│       ├── workflow/
│       │   ├── engine.ts              # 工作流执行引擎
│       │   └── templates.ts           # 预设工作流模板
│       ├── components/
│       │   ├── KnowledgeGraph.svelte  # D3 知识图谱可视化
│       │   └── WorkflowPanel.svelte   # 工作流管理面板
│       ├── nlp-engine.ts              # 规则 NLP（摘要、关键词、语言检测）
│       └── prompt/templates.ts        # 提示词模板
├── native-host/
│   ├── index.js                       # Native Messaging Host (MCP 桥接)
│   ├── manifest.json                  # Host 清单
│   ├── install.bat                    # Windows 注册脚本
│   └── install.sh                     # macOS/Linux 注册脚本
├── wxt.config.ts                      # WXT 构建配置
├── package.json
└── tsconfig.json
```

---

## 使用方法

### 基础用法

1. **捕获上下文** — 访问网页 → 点击扩展图标 → 「捕获当前页面」
2. **选中文本操作** — 选中网页文字 → 浮动工具栏自动出现 → 保存/摘要/翻译/复制
3. **知识搜索** — 侧边栏搜索框输入关键词，语义+关键词混合搜索
4. **上下文编排** — 在 AI 对话中自动组装知识图谱上下文
5. **执行工作流** — 侧边栏工作流面板 → 选择预设流程 → 一键执行

### 快捷键

| 操作 | 快捷键 |
|------|--------|
| 捕获当前页面 | `Ctrl+Shift+C` / `Cmd+Shift+C` |
| 生成提示词 | `Ctrl+Shift+P` / `Cmd+Shift+P` |

### AI 配置

1. 点击扩展图标 → 设置
2. 启用 AI → 选择提供商 → 输入 API Key
3. 可选：启用自动摘要、配置 MCP Server

---

## 隐私保护

### 本地模式（默认）
- 所有数据存储在浏览器本地（IndexedDB + Chrome Storage）
- 向量嵌入在浏览器内计算（Transformers.js，首次使用时从 CDN 下载模型，后续从缓存加载）
- 除嵌入模型下载外，无其他外部网络请求、无数据收集

### AI 增强模式（可选）
- 仅在启用时发送内容到所选 AI API
- API Key 加密存储在本地
- 可随时关闭回到纯本地模式

### MCP Server（可选）
- 仅监听 `127.0.0.1`（本地回环），不暴露到网络
- 需手动安装 Native Messaging Host

---

## 发布渠道

### Chrome Web Store
1. 运行 `npm run zip` 生成 `.zip` 包
2. 访问 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole)
3. 上传 zip 包，填写商店信息，提交审核

### Edge Add-ons
WXT 支持 Edge 构建：`npx wxt build --browser edge`，然后提交到 [Edge 开发者中心](https://partner.microsoft.com/dashboard/microsoftedge/)

### 手动分发
将 `.output/chrome-mv3` 目录或 `.zip` 文件直接分发给用户，通过开发者模式加载。

---

## 构建脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（热更新 + 自动重载） |
| `npm run build` | 生产构建到 `.output/chrome-mv3` |
| `npm run check` | TypeScript + Svelte 类型检查 |
| `npm run zip` | 打包为可发布的 `.zip` |

---

## License

本项目基于 [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE) 开源。

简要说明：
- 你可以自由使用、修改和分发本软件
- 如果你修改后通过网络提供服务，必须公开修改后的源代码
- 所有衍生作品必须使用相同的 AGPL-3.0 许可证

---

Made with ContextPrompt AI
