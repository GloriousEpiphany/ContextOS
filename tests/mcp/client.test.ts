import { describe, it, expect } from 'vitest';
import { diagnoseKnownRemoteMcp } from '../../src/lib/mcp/client';

describe('MCP client diagnostics', () => {
  it('marks official Notion MCP as OAuth-required instead of pretending JSON-RPC POST is enough', () => {
    const diagnosis = diagnoseKnownRemoteMcp('https://mcp.notion.com/mcp');
    expect(diagnosis.oauthRequired).toBe(true);
    expect(diagnosis.message).toContain('OAuth 2.0');
  });

  it('allows regular local HTTP MCP servers through', () => {
    const diagnosis = diagnoseKnownRemoteMcp('http://127.0.0.1:8080');
    expect(diagnosis.oauthRequired).toBe(false);
  });
});
