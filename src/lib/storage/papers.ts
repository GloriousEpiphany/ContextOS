import { db, type PaperRecord, type PaperRepoEdge } from './db';
import { knowledgeGraph } from './knowledge-graph';

export type PaperUpsertInput = Omit<Partial<PaperRecord>, 'id' | 'source' | 'title'> & {
  id: string;
  source: PaperRecord['source'];
  title: string;
};

export interface PaperWithRepos extends PaperRecord {
  repos: PaperRepoEdge[];
}

export interface PaperSearchResult extends PaperWithRepos {
  score: number;
}

export interface PaperContextPackage {
  paper: PaperWithRepos;
  prompt: string;
}

const PAPER_TAGS = ['paper', 'research'];

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.map((author) => String(author).trim()).filter(Boolean);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function paperSearchText(paper: PaperRecord): string {
  return [
    paper.id,
    paper.arxivId,
    paper.title,
    paper.authors.join(' '),
    paper.abstract,
    paper.publishedAt,
    paper.references?.map((ref) => ref.title).join(' '),
    paper.citations?.map((citation) => citation.title).join(' '),
  ].filter(Boolean).join(' ');
}

function sourceUrlForPaper(paper: PaperRecord): string {
  if (paper.source === 'arxiv' && paper.arxivId) return `https://arxiv.org/abs/${paper.arxivId}`;
  if (paper.id.startsWith('openreview:')) {
    return `https://openreview.net/forum?id=${paper.id.replace(/^openreview:/, '')}`;
  }
  return paper.pdfUrl ?? '';
}

function buildPaperContent(paper: PaperRecord): string {
  return [
    `Title: ${paper.title}`,
    paper.authors.length ? `Authors: ${paper.authors.join(', ')}` : '',
    paper.arxivId ? `arXiv: ${paper.arxivId}` : '',
    paper.citedBy !== undefined ? `Citations: ${paper.citedBy}` : '',
    paper.firstAuthorHIndex !== undefined ? `First author h-index: ${paper.firstAuthorHIndex}` : '',
    paper.reviewSummary?.mean !== undefined ? `OpenReview mean score: ${paper.reviewSummary.mean}` : '',
    paper.reviewSummary?.meta ? `OpenReview meta-review: ${paper.reviewSummary.meta}` : '',
    paper.references?.length ? `References: ${paper.references.map((ref) => ref.title).join('; ')}` : '',
    paper.citations?.length ? `Cited by: ${paper.citations.map((citation) => citation.title).join('; ')}` : '',
    paper.abstract ? `Abstract: ${paper.abstract}` : '',
  ].filter(Boolean).join('\n');
}

export async function upsertPaper(input: PaperUpsertInput): Promise<PaperRecord> {
  const now = Date.now();
  const existing = await db.papers.get(input.id);
  const next: PaperRecord = {
    ...existing,
    ...input,
    authors: normalizeAuthors(input.authors ?? existing?.authors),
    capturedAt: existing?.capturedAt ?? input.capturedAt ?? now,
    firstAuthorHIndex: input.firstAuthorHIndex ?? existing?.firstAuthorHIndex,
    citedBy: input.citedBy ?? existing?.citedBy,
    knowledgeNodeId: existing?.knowledgeNodeId,
  };

  await db.papers.put(next);
  return next;
}

export async function ensurePaperKnowledgeNode(paperId: string): Promise<number | undefined> {
  const paper = await db.papers.get(paperId);
  if (!paper) return undefined;

  if (paper.knowledgeNodeId) {
    const existingNode = await db.knowledgeNodes.get(paper.knowledgeNodeId);
    if (existingNode) return paper.knowledgeNodeId;
  }

  const node = await knowledgeGraph.addFromContext({
    id: `paper:${paper.id}`,
    timestamp: new Date(paper.capturedAt).toISOString(),
    title: paper.title,
    url: sourceUrlForPaper(paper),
    selection: '',
    description: paper.abstract ?? '',
    ogData: {},
    structuredData: {},
    mainContent: buildPaperContent(paper),
    chatContent: '',
    isPrivateLink: false,
    platformName: paper.source,
    captureDepth: 'standard',
    notes: '',
    tags: [
      ...PAPER_TAGS,
      paper.source,
      ...(paper.arxivId ? ['arxiv'] : []),
    ],
    aiSummary: '',
  });

  await db.papers.update(paper.id, { knowledgeNodeId: node.id });
  return node.id;
}

export async function upsertPaperAndKnowledge(input: PaperUpsertInput): Promise<PaperRecord> {
  const paper = await upsertPaper(input);
  await ensurePaperKnowledgeNode(paper.id);
  return (await db.papers.get(paper.id)) ?? paper;
}

export async function linkPaperRepo(
  paperId: string,
  repoFullName: string,
  source: PaperRepoEdge['source'],
  confidence: number,
  createdAt = Date.now(),
): Promise<boolean> {
  const existing = await db.paperRepoEdges
    .where('[paperId+repoFullName]')
    .equals([paperId, repoFullName])
    .count();

  if (existing > 0) return false;

  await db.paperRepoEdges.add({
    paperId,
    repoFullName,
    source,
    confidence,
    createdAt,
  });
  return true;
}

export async function getPaperWithRepos(paperId: string): Promise<PaperWithRepos | null> {
  const paper = await db.papers.get(paperId);
  if (!paper) return null;
  const repos = await db.paperRepoEdges.where('paperId').equals(paperId).toArray();
  return { ...paper, repos };
}

export async function listRecentPapers(limit = 20): Promise<PaperWithRepos[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const papers = await db.papers.orderBy('capturedAt').reverse().limit(boundedLimit).toArray();
  return Promise.all(papers.map(async (paper) => ({
    ...paper,
    repos: await db.paperRepoEdges.where('paperId').equals(paper.id).toArray(),
  })));
}

export async function searchPapers(query: string, limit = 5): Promise<PaperSearchResult[]> {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    const recent = await listRecentPapers(boundedLimit);
    return recent.map((paper, index) => ({ ...paper, score: 1 / (index + 1) }));
  }

  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return [];

  const papers = await db.papers.toArray();
  const scored = await Promise.all(papers.map(async (paper) => {
    const text = paperSearchText(paper).toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      if (paper.arxivId?.toLowerCase() === token || paper.id.toLowerCase().includes(token)) score += 8;
      if (paper.title.toLowerCase().includes(token)) score += 5;
      if (paper.authors.some((author) => author.toLowerCase().includes(token))) score += 3;
      if (paper.abstract?.toLowerCase().includes(token)) score += 1;
      if (text.includes(token)) score += 0.5;
    }

    if (score === 0) return null;

    const repos = await db.paperRepoEdges.where('paperId').equals(paper.id).toArray();
    return { ...paper, repos, score };
  }));

  return scored
    .filter((paper): paper is PaperSearchResult => paper !== null)
    .sort((a, b) => b.score - a.score || b.capturedAt - a.capturedAt)
    .slice(0, boundedLimit);
}

export async function buildPaperContext(paperId: string): Promise<PaperContextPackage | null> {
  const paper = await getPaperWithRepos(paperId);
  if (!paper) return null;

  const prompt = [
    `Paper: ${paper.title}`,
    paper.arxivId ? `arXiv: ${paper.arxivId}` : `ID: ${paper.id}`,
    paper.authors.length ? `Authors: ${paper.authors.join(', ')}` : '',
    paper.citedBy !== undefined ? `Citations: ${paper.citedBy}` : '',
    paper.firstAuthorHIndex !== undefined ? `First author h-index: ${paper.firstAuthorHIndex}` : '',
    paper.reviewSummary?.mean !== undefined ? `OpenReview mean score: ${paper.reviewSummary.mean}` : '',
    paper.reviewSummary?.confidence !== undefined ? `OpenReview confidence: ${paper.reviewSummary.confidence}` : '',
    paper.reviewSummary?.meta ? `OpenReview meta-review:\n${paper.reviewSummary.meta}` : '',
    paper.repos.length ? `Linked GitHub repos: ${paper.repos.map((repo) => repo.repoFullName).join(', ')}` : '',
    paper.references?.length ? `Reference graph:\n${paper.references.map((ref) => `- ${ref.title}${ref.year ? ` (${ref.year})` : ''}`).join('\n')}` : '',
    paper.citations?.length ? `Citation graph:\n${paper.citations.map((citation) => `- ${citation.title}${citation.year ? ` (${citation.year})` : ''}`).join('\n')}` : '',
    paper.abstract ? `Abstract:\n${paper.abstract}` : '',
  ].filter(Boolean).join('\n\n');

  return { paper, prompt };
}
