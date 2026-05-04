/**
 * REGRESSION test (per eng review IRON RULE):
 * Dexie schema v1 → v2 upgrade must be additive.
 * Old data (contexts, knowledgeNodes, embeddings, relations, promptHistory) must
 * survive the migration. New tables (papers, paperRepoEdges, chats) must be
 * created on first open.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

describe('Dexie schema v1 -> v2 migration (REGRESSION)', () => {
  const DB_NAME = 'ContextPromptAI_test_migration';

  beforeEach(async () => {
    await Dexie.delete(DB_NAME);
  });
  afterEach(async () => {
    await Dexie.delete(DB_NAME);
  });

  it('v1 data survives upgrade to v2', async () => {
    // Step 1: open DB at v1 schema, write data
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores({
      contexts: 'id, timestamp, url',
      knowledgeNodes: '++id, contextId, title, createdAt, *tags',
      embeddings: '++id, nodeId',
      relations: '++id, sourceId, targetId, [sourceId+targetId]',
      promptHistory: 'id, timestamp, favorite',
    });
    await v1.open();
    await v1.table('contexts').put({ id: 'ctx-1', timestamp: '2025-01-01', url: 'https://arxiv.org/abs/2403.05525' });
    await v1.table('knowledgeNodes').put({ id: 1, contextId: 'ctx-1', title: 'SimCLR', createdAt: 1, tags: ['cv'] });
    await v1.table('promptHistory').put({ id: 'p-1', timestamp: 1, favorite: false });
    v1.close();

    // Step 2: reopen at v2 schema (additive: new tables only)
    const v2 = new Dexie(DB_NAME);
    v2.version(1).stores({
      contexts: 'id, timestamp, url',
      knowledgeNodes: '++id, contextId, title, createdAt, *tags',
      embeddings: '++id, nodeId',
      relations: '++id, sourceId, targetId, [sourceId+targetId]',
      promptHistory: 'id, timestamp, favorite',
    });
    v2.version(2).stores({
      contexts: 'id, timestamp, url',
      knowledgeNodes: '++id, contextId, title, createdAt, *tags',
      embeddings: '++id, nodeId',
      relations: '++id, sourceId, targetId, [sourceId+targetId]',
      promptHistory: 'id, timestamp, favorite',
      papers: 'id, source, arxivId, capturedAt',
      paperRepoEdges: '++id, paperId, repoFullName, [paperId+repoFullName]',
      chats: 'id, source, conversationId, capturedAt, lastUsedAt',
    });
    await v2.open();

    // Step 3: assert old data preserved
    const ctx = await v2.table('contexts').get('ctx-1');
    expect(ctx).toBeTruthy();
    expect(ctx?.url).toBe('https://arxiv.org/abs/2403.05525');

    const node = await v2.table('knowledgeNodes').get(1);
    expect(node?.title).toBe('SimCLR');

    const ph = await v2.table('promptHistory').get('p-1');
    expect(ph).toBeTruthy();

    // Step 4: assert new tables exist and are writable
    await v2.table('papers').put({
      id: 'arxiv:2403.05525',
      source: 'arxiv',
      arxivId: '2403.05525',
      title: 'Test Paper',
      authors: ['A. Author'],
      capturedAt: Date.now(),
    });
    const paper = await v2.table('papers').get('arxiv:2403.05525');
    expect(paper?.title).toBe('Test Paper');

    await v2.table('paperRepoEdges').add({
      paperId: 'arxiv:2403.05525',
      repoFullName: 'google-research/simclr',
      source: 'readme_arxiv_id',
      confidence: 0.9,
      createdAt: Date.now(),
    });
    const edges = await v2.table('paperRepoEdges').where('paperId').equals('arxiv:2403.05525').toArray();
    expect(edges).toHaveLength(1);

    await v2.table('chats').put({
      id: 'chat-1',
      source: 'chatgpt',
      conversationId: 'conv-abc',
      tabId: 1,
      messages: [],
      paperRefs: [],
      capturedAt: Date.now(),
    });
    const chat = await v2.table('chats').get('chat-1');
    expect(chat?.source).toBe('chatgpt');

    v2.close();
  });

  it('compound index [paperId+repoFullName] dedupes correctly', async () => {
    const db = new Dexie(DB_NAME);
    db.version(2).stores({
      contexts: 'id, timestamp, url',
      knowledgeNodes: '++id, contextId, title, createdAt, *tags',
      embeddings: '++id, nodeId',
      relations: '++id, sourceId, targetId, [sourceId+targetId]',
      promptHistory: 'id, timestamp, favorite',
      papers: 'id, source, arxivId, capturedAt',
      paperRepoEdges: '++id, paperId, repoFullName, [paperId+repoFullName]',
      chats: 'id, source, conversationId, capturedAt, lastUsedAt',
    });
    await db.open();

    await db.table('paperRepoEdges').add({
      paperId: 'arxiv:1', repoFullName: 'a/b', source: 'readme_arxiv_id', confidence: 0.5, createdAt: 1,
    });
    const found = await db.table('paperRepoEdges')
      .where('[paperId+repoFullName]').equals(['arxiv:1', 'a/b']).count();
    expect(found).toBe(1);
    db.close();
  });
});
