import { describe, it, expect, vi } from 'vitest';
import { MCP_TOOLS, createToolHandlers } from '../../src/lib/mcp/server-tools';

function textFromResult(result: Awaited<ReturnType<ReturnType<typeof createToolHandlers>[string]>>) {
  return result.content[0]?.type === 'text' ? result.content[0].text : '';
}

describe('MCP researcher paper tools', () => {
  it('exposes paper-specific MCP tools', () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toContain('search_papers');
    expect(names).toContain('get_paper_context');
    expect(names).toContain('list_recent_papers');
  });

  it('delegates search_papers to the paper search dependency', async () => {
    const searchPapers = vi.fn(async () => [{ id: 'arxiv:2002.05709', title: 'SimCLR' }]);
    const handlers = createToolHandlers({
      searchKnowledge: vi.fn(),
      assembleContext: vi.fn(),
      captureCurrentTab: vi.fn(),
      listKnowledgeNodes: vi.fn(),
      getStats: vi.fn(),
      searchPapers,
      getPaperContext: vi.fn(),
      listRecentPapers: vi.fn(),
      screenshotActiveTab: vi.fn(),
      extractImagesFromTab: vi.fn(),
      capturePageWithImages: vi.fn(),
    });

    const result = await handlers.search_papers({ query: 'simclr', limit: 3 });
    expect(searchPapers).toHaveBeenCalledWith('simclr', 3);
    expect(textFromResult(result)).toContain('arxiv:2002.05709');
  });

  it('returns an MCP error result when a paper context is missing', async () => {
    const handlers = createToolHandlers({
      searchKnowledge: vi.fn(),
      assembleContext: vi.fn(),
      captureCurrentTab: vi.fn(),
      listKnowledgeNodes: vi.fn(),
      getStats: vi.fn(),
      searchPapers: vi.fn(),
      getPaperContext: vi.fn(async () => null),
      listRecentPapers: vi.fn(),
      screenshotActiveTab: vi.fn(),
      extractImagesFromTab: vi.fn(),
      capturePageWithImages: vi.fn(),
    });

    const result = await handlers.get_paper_context({ paperId: 'arxiv:missing' });
    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toContain('Paper not found');
  });
});
