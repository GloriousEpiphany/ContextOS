import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

import { db } from '../../src/lib/storage/db';
import {
  buildPaperContext,
  ensurePaperKnowledgeNode,
  getPaperWithRepos,
  linkPaperRepo,
  listRecentPapers,
  searchPapers,
  upsertPaper,
} from '../../src/lib/storage/papers';

describe('paper storage service', () => {
  beforeEach(async () => {
    await db.papers.clear();
    await db.paperRepoEdges.clear();
    await db.knowledgeNodes.clear();
    await db.relations.clear();
    await db.embeddings.clear();
  });

  afterEach(async () => {
    await db.papers.clear();
    await db.paperRepoEdges.clear();
    await db.knowledgeNodes.clear();
    await db.relations.clear();
    await db.embeddings.clear();
  });

  it('upserts paper metadata without losing existing enrichment', async () => {
    await upsertPaper({
      id: 'arxiv:2002.05709',
      source: 'arxiv',
      arxivId: '2002.05709',
      title: 'A Simple Framework for Contrastive Learning',
      authors: ['Ting Chen'],
      citedBy: 12000,
      firstAuthorHIndex: 55,
      capturedAt: 10,
    });

    const updated = await upsertPaper({
      id: 'arxiv:2002.05709',
      source: 'arxiv',
      arxivId: '2002.05709',
      title: 'A Simple Framework for Contrastive Learning of Visual Representations',
      authors: ['Ting Chen', 'Simon Kornblith'],
      abstract: 'SimCLR learns visual representations.',
      capturedAt: 20,
    });

    expect(updated.title).toContain('Visual Representations');
    expect(updated.authors).toEqual(['Ting Chen', 'Simon Kornblith']);
    expect(updated.citedBy).toBe(12000);
    expect(updated.firstAuthorHIndex).toBe(55);
    expect(updated.capturedAt).toBe(10);
  });

  it('creates a knowledge node for a captured paper and reuses it on later calls', async () => {
    await upsertPaper({
      id: 'arxiv:2403.05525',
      source: 'arxiv',
      arxivId: '2403.05525',
      title: 'Vision Mamba',
      authors: ['A. Researcher'],
      abstract: 'A paper about vision sequence models.',
      capturedAt: 100,
    });

    const firstNodeId = await ensurePaperKnowledgeNode('arxiv:2403.05525');
    const secondNodeId = await ensurePaperKnowledgeNode('arxiv:2403.05525');
    const nodes = await db.knowledgeNodes.toArray();

    expect(firstNodeId).toBeDefined();
    expect(secondNodeId).toBe(firstNodeId);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].url).toBe('https://arxiv.org/abs/2403.05525');
    expect(nodes[0].content).toContain('Vision Mamba');
  });

  it('deduplicates GitHub repo edges for the same paper and repo', async () => {
    const first = await linkPaperRepo('arxiv:2002.05709', 'google-research/simclr', 'readme_arxiv_id', 0.8, 1);
    const second = await linkPaperRepo('arxiv:2002.05709', 'google-research/simclr', 'readme_arxiv_id', 0.8, 2);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await db.paperRepoEdges.count()).toBe(1);
  });

  it('searches papers by title, author, and arXiv ID with bounded limits', async () => {
    await upsertPaper({
      id: 'arxiv:2002.05709',
      source: 'arxiv',
      arxivId: '2002.05709',
      title: 'A Simple Framework for Contrastive Learning',
      authors: ['Ting Chen'],
      abstract: 'SimCLR',
      capturedAt: 1,
    });
    await upsertPaper({
      id: 'arxiv:1706.03762',
      source: 'arxiv',
      arxivId: '1706.03762',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani'],
      abstract: 'Transformer architecture.',
      capturedAt: 2,
    });

    expect((await searchPapers('contrastive', 5))[0].id).toBe('arxiv:2002.05709');
    expect((await searchPapers('Vaswani', 5))[0].id).toBe('arxiv:1706.03762');
    expect((await searchPapers('1706.03762', 5))[0].title).toBe('Attention Is All You Need');
    expect(await searchPapers('missing term', 5)).toEqual([]);
  });

  it('lists recent papers and includes linked repos', async () => {
    await upsertPaper({
      id: 'arxiv:old',
      source: 'arxiv',
      arxivId: '1111.11111',
      title: 'Old Paper',
      authors: [],
      capturedAt: 1,
    });
    await upsertPaper({
      id: 'arxiv:new',
      source: 'arxiv',
      arxivId: '2222.22222',
      title: 'New Paper',
      authors: [],
      capturedAt: 2,
    });
    await linkPaperRepo('arxiv:new', 'owner/repo', 'readme_arxiv_id', 0.8, 3);

    const recent = await listRecentPapers(2);
    expect(recent.map((paper) => paper.id)).toEqual(['arxiv:new', 'arxiv:old']);
    expect(recent[0].repos[0].repoFullName).toBe('owner/repo');
  });

  it('builds prompt-ready paper context with repo links and metrics', async () => {
    await upsertPaper({
      id: 'arxiv:2002.05709',
      source: 'arxiv',
      arxivId: '2002.05709',
      title: 'A Simple Framework for Contrastive Learning',
      authors: ['Ting Chen', 'Simon Kornblith'],
      abstract: 'This paper presents SimCLR.',
      citedBy: 12000,
      firstAuthorHIndex: 55,
      references: [{ paperId: 'ref1', title: 'Reference Paper' }],
      citations: [{ paperId: 'cite1', title: 'Citing Paper', year: 2024 }],
      capturedAt: 1,
    });
    await linkPaperRepo('arxiv:2002.05709', 'google-research/simclr', 'readme_arxiv_id', 0.8, 2);

    const context = await buildPaperContext('arxiv:2002.05709');
    expect(context?.prompt).toContain('A Simple Framework for Contrastive Learning');
    expect(context?.prompt).toContain('Citations: 12000');
    expect(context?.prompt).toContain('Linked GitHub repos: google-research/simclr');
    expect(context?.prompt).toContain('Reference graph');
    expect(context?.prompt).toContain('Citation graph');

    const paper = await getPaperWithRepos('arxiv:2002.05709');
    expect(paper?.repos).toHaveLength(1);
  });
});
