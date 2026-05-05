/**
 * ContextPrompt AI v4.0 — MCP Client
 * Connects to external MCP servers via HTTP Streamable transport.
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPTool,
  MCPToolResult,
} from './protocol';
import { MCP_METHODS } from './protocol';

// ----------------------------------------------------------------------------
// MCPClient
// ----------------------------------------------------------------------------

export class MCPClient {
  private serverUrl: string;
  private tools: MCPTool[] = [];
  private connected = false;
  private requestId = 1;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, '');
  }

  /**
   * Connect to the MCP server and retrieve available tools.
   */
  async connect(): Promise<void> {
    const known = diagnoseKnownRemoteMcp(this.serverUrl);
    if (known.oauthRequired) {
      throw new Error(known.message);
    }

    // Send initialize request
    await this.sendRequest(MCP_METHODS.INITIALIZE, {
      protocolVersion: '2025-03-26',
      clientInfo: {
        name: 'contextprompt-ai',
        version: '4.0.0',
      },
      capabilities: {},
    });

    // List available tools
    const result = await this.sendRequest(MCP_METHODS.TOOLS_LIST, {});
    if (result && Array.isArray((result as { tools?: unknown[] }).tools)) {
      this.tools = (result as { tools: MCPTool[] }).tools;
    }

    this.connected = true;
  }

  /**
   * Get the list of available tools from the connected server.
   */
  listTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Call a tool on the connected MCP server.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    if (!this.connected) {
      throw new Error('MCP client not connected. Call connect() first.');
    }

    const result = await this.sendRequest(MCP_METHODS.TOOLS_CALL, {
      name,
      arguments: args,
    });

    return result as MCPToolResult;
  }

  /**
   * Check if the client is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    this.connected = false;
    this.tools = [];
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params,
    };

    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP server returned HTTP ${response.status}`);
    }

    const json: JsonRpcResponse = await response.json();

    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    }

    return json.result;
  }
}

export function diagnoseKnownRemoteMcp(serverUrl: string): { oauthRequired: boolean; message: string } {
  const normalized = serverUrl.replace(/\/+$/, '');
  if (normalized === 'https://mcp.notion.com/mcp' || normalized === 'https://mcp.notion.com/sse') {
    return {
      oauthRequired: true,
      message:
        'Notion MCP requires OAuth 2.0 with PKCE. ContextOS can document and export this connector, but direct in-extension Notion OAuth is not enabled yet. Connect Notion through Claude Desktop/Cursor/ChatGPT Connectors using https://mcp.notion.com/mcp, or use a local mcp-remote bridge.',
    };
  }
  return { oauthRequired: false, message: '' };
}
