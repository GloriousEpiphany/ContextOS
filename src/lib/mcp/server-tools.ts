/**
 * ContextPrompt AI v4.0 — MCP Server Tools
 * Defines the 5 MCP tools exposed by the extension.
 */

import type { MCPTool, MCPToolResult } from './protocol';
import { createToolResult } from './protocol';

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
  };
}
