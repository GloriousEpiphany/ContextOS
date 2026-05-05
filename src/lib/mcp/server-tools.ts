/**
 * ContextPrompt AI v4.0 — MCP Server Tools
 * Defines the 5 MCP tools exposed by the extension.
 */

import type { MCPTool, MCPToolResult, MCPContentItem } from './protocol';
import { createToolResult, createImageResult, createMixedResult } from './protocol';

// ----------------------------------------------------------------------------
// Tool Definitions
// ----------------------------------------------------------------------------

export const MCP_TOOLS: MCPTool[] = [
  {
    name: 'search_knowledge',
    description: 'Search the knowledge graph for relevant information using semantic and keyword search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        topK: { type: 'number', description: 'Max results to return', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_context',
    description: 'Assemble a context package from the knowledge graph for a given query and model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user query for context assembly' },
        model: { type: 'string', description: 'Target AI model', default: 'gpt-4o' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_papers',
    description: 'Search captured research papers by title, author, arXiv ID, abstract, or venue.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Paper search query, e.g. "contrastive learning" or "2403.05525"' },
        limit: { type: 'number', description: 'Max papers to return', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_paper_context',
    description: 'Return a prompt-ready context package for one captured paper, including linked GitHub repos.',
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Stable paper ID, e.g. "arxiv:2403.05525"' },
      },
      required: ['paperId'],
    },
  },
  {
    name: 'list_recent_papers',
    description: 'List recently captured research papers.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max papers to return', default: 20 },
      },
    },
  },
  {
    name: 'capture_page',
    description: 'Capture the currently active browser tab and add it to the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_knowledge',
    description: 'List recent knowledge nodes from the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max nodes to return', default: 20 },
      },
    },
  },
  {
    name: 'get_stats',
    description: 'Get statistics about the knowledge graph (node count, relation count, etc.).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the currently active browser tab (visible area).',
    inputSchema: {
      type: 'object',
      properties: {
        quality: { type: 'number', description: 'JPEG quality 1-100 (default: PNG if omitted)' },
      },
    },
  },
  {
    name: 'extract_images',
    description: 'Extract image elements from the active tab, returning URLs and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        minWidth: { type: 'number', description: 'Minimum image width in px', default: 50 },
        minHeight: { type: 'number', description: 'Minimum image height in px', default: 50 },
        maxCount: { type: 'number', description: 'Max images to return', default: 20 },
        includeBase64: { type: 'boolean', description: 'Fetch images as base64 (max 4MB each)', default: false },
      },
    },
  },
  {
    name: 'capture_page_with_images',
    description: 'Enhanced page capture: returns text content plus a screenshot of the visible area.',
    inputSchema: {
      type: 'object',
      properties: {
        quality: { type: 'number', description: 'Screenshot JPEG quality 1-100 (default: PNG)' },
      },
    },
  },
];

// ----------------------------------------------------------------------------
// Tool Handlers
// ----------------------------------------------------------------------------

export type ToolHandler = (args: Record<string, unknown>) => Promise<MCPToolResult>;

/**
 * Create tool handlers that delegate to the extension's background services.
 * Each handler is called with the tool arguments and returns an MCPToolResult.
 *
 * @param deps - The background service dependencies (lazy-loaded)
 */
export function createToolHandlers(deps: {
  searchKnowledge: (query: string) => Promise<unknown[]>;
  assembleContext: (query: string, model: string) => Promise<unknown>;
  captureCurrentTab: () => Promise<{ success: boolean; error?: string }>;
  listKnowledgeNodes: (limit: number) => Promise<unknown[]>;
  getStats: () => Promise<unknown>;
  searchPapers: (query: string, limit: number) => Promise<unknown[]>;
  getPaperContext: (paperId: string) => Promise<unknown>;
  listRecentPapers: (limit: number) => Promise<unknown[]>;
  screenshotActiveTab: (quality?: number) => Promise<{ dataUrl: string }>;
  extractImagesFromTab: (options: { minWidth?: number; minHeight?: number; maxCount?: number; includeBase64?: boolean }) => Promise<{ images: unknown[] }>;
  capturePageWithImages: (options: { quality?: number }) => Promise<{ text: string; screenshotDataUrl: string }>;
}): Record<string, ToolHandler> {
  return {
    search_knowledge: async (args) => {
      const query = args.query as string;
      const results = await deps.searchKnowledge(query);
      return createToolResult(JSON.stringify(results, null, 2));
    },

    get_context: async (args) => {
      const query = args.query as string;
      const model = (args.model as string) || 'gpt-4o';
      const context = await deps.assembleContext(query, model);
      return createToolResult(JSON.stringify(context, null, 2));
    },

    search_papers: async (args) => {
      const query = args.query as string;
      const limit = (args.limit as number) || 5;
      const results = await deps.searchPapers(query, limit);
      return createToolResult(JSON.stringify(results, null, 2));
    },

    get_paper_context: async (args) => {
      const paperId = args.paperId as string;
      const context = await deps.getPaperContext(paperId);
      if (!context) return createToolResult(`Paper not found: ${paperId}`, true);
      return createToolResult(JSON.stringify(context, null, 2));
    },

    list_recent_papers: async (args) => {
      const limit = (args.limit as number) || 20;
      const papers = await deps.listRecentPapers(limit);
      return createToolResult(JSON.stringify(papers, null, 2));
    },

    capture_page: async () => {
      const result = await deps.captureCurrentTab();
      if (result.success) {
        return createToolResult('Page captured successfully.');
      }
      return createToolResult(`Capture failed: ${result.error || 'Unknown error'}`, true);
    },

    list_knowledge: async (args) => {
      const limit = (args.limit as number) || 20;
      const nodes = await deps.listKnowledgeNodes(limit);
      return createToolResult(JSON.stringify(nodes, null, 2));
    },

    get_stats: async () => {
      const stats = await deps.getStats();
      return createToolResult(JSON.stringify(stats, null, 2));
    },

    screenshot: async (args) => {
      const quality = args.quality as number | undefined;
      const { dataUrl } = await deps.screenshotActiveTab(quality);
      // dataUrl is "data:image/png;base64,..." — strip prefix
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return createToolResult('Screenshot failed: invalid data URL', true);
      return createImageResult(match[2], match[1]);
    },

    extract_images: async (args) => {
      const result = await deps.extractImagesFromTab({
        minWidth: args.minWidth as number | undefined,
        minHeight: args.minHeight as number | undefined,
        maxCount: args.maxCount as number | undefined,
        includeBase64: args.includeBase64 as boolean | undefined,
      });
      return createToolResult(JSON.stringify(result.images, null, 2));
    },

    capture_page_with_images: async (args) => {
      const quality = args.quality as number | undefined;
      const { text, screenshotDataUrl } = await deps.capturePageWithImages({ quality });
      const match = screenshotDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      const items: MCPContentItem[] = [{ type: 'text', text }];
      if (match) {
        items.push({ type: 'image', data: match[2], mimeType: match[1] });
      }
      return createMixedResult(items);
    },
  };
}
