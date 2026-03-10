/**
 * ContextPrompt AI v4.0 — MCP Protocol Types
 * JSON-RPC 2.0 based MCP protocol definitions (minimal subset).
 * No external SDK dependency.
 */

// ----------------------------------------------------------------------------
// JSON-RPC 2.0
// ----------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ----------------------------------------------------------------------------
// MCP Tool Definitions
// ----------------------------------------------------------------------------

export interface MCPToolSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolSchema;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// ----------------------------------------------------------------------------
// MCP Methods
// ----------------------------------------------------------------------------

export const MCP_METHODS = {
  INITIALIZE: 'initialize',
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
} as const;

// ----------------------------------------------------------------------------
// MCP Server Info
// ----------------------------------------------------------------------------

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

export const SERVER_INFO: MCPServerInfo = {
  name: 'contextprompt-ai',
  version: '4.0.0',
  protocolVersion: '2025-03-26',
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function createSuccessResponse(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

export function createToolResult(text: string, isError = false): MCPToolResult {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}
