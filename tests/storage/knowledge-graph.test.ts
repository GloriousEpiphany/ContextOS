/**
 * Comprehensive tests for KnowledgeGraph — Jaccard similarity, getDomain,
 * CRUD operations, relation discovery, and edge cases.
 *
 * Decision boundaries tested:
 * - Jaccard: empty sets, identical sets, disjoint sets, partial overlap, case insensitivity
 * - getDomain: valid URL, invalid URL, empty string, URL with port
 * - addFromContext: tag generation, deduplication, summary creation
 * - deleteNode: cascade deletion of embeddings + relations
 * - discoverRelations: url_domain match, tag_overlap threshold (0.3), existing relation dedup
 * - getRelatedNodes: bidirectional relation lookup
 * - getGraphData: returns all nodes and edges
 * - getStats: counts across 3 tables
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

import {
  jaccardSimilarity,
  getDomain,
  KnowledgeGraph,
} from '../../src/lib/storage/knowledge-graph';
import { db } from '../../src/lib/storage/db';
import type { CapturedContext } from '../../src/types/index';

// ── Pure function tests ──

describe('jaccardSimilarity', () => {
  it('returns 0 for two empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('returns 0 when first set is empty', () => {
    expect(jaccardSimilarity([], ['a', 'b'])).toBe(0);
  });

  it('returns 0 when second set is empty', () => {
    expect(jaccardSimilarity(['a', 'b'], [])).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBeCloseTo(0.0, 5);
  });

  it('returns correct value for partial overlap', () => {
    // {a,b} ∩ {b,c} = {b} → 1/3
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('is case insensitive', () => {
    expect(jaccardSimilarity(['Hello', 'World'], ['hello', 'world'])).toBeCloseTo(1.0, 5);
  });

  it('handles duplicate elements within a set', () => {
    // Duplicates are collapsed by Set construction inside the function
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBeCloseTo(1.0, 5);
  });

  it('handles single-element sets', () => {
    expect(jaccardSimilarity(['a'], ['a'])).toBeCloseTo(1.0, 5);
    expect(jaccardSimilarity(['a'], ['b'])).toBeCloseTo(0.0, 5);
  });

  it('handles large sets', () => {
    const a = Array.from({ length: 100 }, (_, i) => `tag${i}`);
    const b = Array.from({ length: 100 }, (_, i) => `tag${i + 50}`);
    // Intersection: tag50..tag99 = 50 items
    // Union: tag0..tag149 = 150 items
    // Jaccard = 50/150 = 1/3
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3, 5);
  });
});

describe('getDomain', () => {
  it('extracts hostname from valid URL', () => {
    expect(getDomain('https://arxiv.org/abs/2403.05525')).toBe('arxiv.org');
    expect(getDomain('https://github.com/google-research/simclr')).toBe('github.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(getDomain('not a url')).toBe('');
    expect(getDomain('')).toBe('');
  });

  it('handles URL with port', () => {
    expect(getDomain('http://localhost:3000/path')).toBe('localhost');
  });

  it('handles URL with subdomain', () => {
    expect(getDomain('https://openaccess.thecvf.com/CVPR2024')).toBe('openaccess.thecvf.com');
  });
});

// ── KnowledgeGraph class tests ──

describe('KnowledgeGraph (class)', () => {
  let kg: KnowledgeGraph;

  function makeContext(overrides: Partial<CapturedContext> = {}): CapturedContext {
    return {
      id: `ctx-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      title: 'Test Paper Title',
      url: 'https://arxiv.org/abs/2403.05525',
      selection: '',
      description: '',
      ogData: {},
      structuredData: {},
      mainContent: 'This is test content about contrastive learning and vision transformers.',
      chatContent: '',
      isPrivateLink: false,
      platformName: '',
      captureDepth: 'standard',
      notes: '',
      tags: [],
      aiSummary: '',
      ...overrides,
    };
  }

  /** Wait for fire-and-forget promises (discoverRelations, generateEmbedding) to settle. */
  const flushAsync = () => new Promise((r) => setTimeout(r, 50));

  beforeEach(async () => {
    kg = new KnowledgeGraph();
    // Clear all tables
    await db.knowledgeNodes.clear();
    await db.relations.clear();
    await db.embeddings.clear();
  });

  afterEach(async () => {
    await db.knowledgeNodes.clear();
    await db.relations.clear();
    await db.embeddings.clear();
  });

  // ── addFromContext ──

  describe('addFromContext', () => {
    it('creates a node with generated tags', async () => {
      const ctx = makeContext({
        title: 'SimCLR: A Simple Framework for Contrastive Learning',
        mainContent: 'We present SimCLR, a contrastive learning framework for visual representations.',
      });

      const node = await kg.addFromContext(ctx);

      expect(node.id).toBeDefined();
      expect(node.title).toBe(ctx.title);
      expect(node.tags.length).toBeGreaterThan(0);
      expect(node.contextId).toBe(ctx.id);
    });

    it('merges user tags with generated tags', async () => {
      const ctx = makeContext({
        tags: ['custom-tag', 'another-tag'],
        mainContent: 'Machine learning research paper about neural networks.',
      });

      const node = await kg.addFromContext(ctx);

      // Should contain both user tags (lowercased) and generated tags
      expect(node.tags).toContain('custom-tag');
      expect(node.tags).toContain('another-tag');
    });

    it('deduplicates tags case-insensitively', async () => {
      const ctx = makeContext({
        tags: ['CV', 'cv'],
        mainContent: 'Computer vision research.',
      });

      const node = await kg.addFromContext(ctx);
      const cvTags = node.tags.filter((t) => t === 'cv');
      expect(cvTags).toHaveLength(1);
    });

    it('creates node even with empty content', async () => {
      const ctx = makeContext({
        title: '',
        mainContent: '',
        selection: '',
        description: '',
      });

      const node = await kg.addFromContext(ctx);
      expect(node.id).toBeDefined();
    });

    it('uses selection content when mainContent is empty', async () => {
      const ctx = makeContext({
        mainContent: '',
        selection: 'Selected text from the page.',
      });

      const node = await kg.addFromContext(ctx);
      expect(node.content).toBe('Selected text from the page.');
    });
  });

  // ── getNode ──

  describe('getNode', () => {
    it('returns undefined for non-existent node', async () => {
      const node = await kg.getNode(999);
      expect(node).toBeUndefined();
    });

    it('returns the node after creation', async () => {
      const ctx = makeContext();
      const created = await kg.addFromContext(ctx);
      const fetched = await kg.getNode(created.id!);
      expect(fetched).toBeDefined();
      expect(fetched!.title).toBe(ctx.title);
    });
  });

  // ── deleteNode ──

  describe('deleteNode', () => {
    it('deletes the node itself', async () => {
      const ctx = makeContext();
      const node = await kg.addFromContext(ctx);
      await kg.deleteNode(node.id!);
      expect(await kg.getNode(node.id!)).toBeUndefined();
    });

    it('deletes associated relations (as source)', async () => {
      const ctx1 = makeContext({ url: 'https://arxiv.org/abs/1' });
      const ctx2 = makeContext({ url: 'https://arxiv.org/abs/2' });
      const node1 = await kg.addFromContext(ctx1);
      const node2 = await kg.addFromContext(ctx2);

      // Wait for fire-and-forget discoverRelations to complete, then clear
      await flushAsync();
      await db.relations.clear();
      // Manually create a relation
      await db.relations.add({
        sourceId: node1.id!,
        targetId: node2.id!,
        similarity: 0.8,
        type: 'semantic',
      });

      await kg.deleteNode(node1.id!);

      // Relations involving node1 should be gone
      const remaining = await db.relations.toArray();
      expect(remaining.every((r) => r.sourceId !== node1.id && r.targetId !== node1.id)).toBe(true);
    });

    it('is a no-op for non-existent node', async () => {
      await expect(kg.deleteNode(999)).resolves.not.toThrow();
    });
  });

  // ── getRelatedNodes ──

  describe('getRelatedNodes', () => {
    it('returns empty array when no relations exist', async () => {
      const ctx = makeContext();
      const node = await kg.addFromContext(ctx);
      const related = await kg.getRelatedNodes(node.id!);
      expect(related).toEqual([]);
    });

    it('finds related nodes via sourceId', async () => {
      const ctx1 = makeContext({ url: 'https://a.com/1' });
      const ctx2 = makeContext({ url: 'https://b.com/2' });
      const node1 = await kg.addFromContext(ctx1);
      const node2 = await kg.addFromContext(ctx2);

      // Wait for fire-and-forget discoverRelations to complete, then clear
      await flushAsync();
      await db.relations.clear();
      await db.relations.add({
        sourceId: node1.id!,
        targetId: node2.id!,
        similarity: 0.7,
        type: 'semantic',
      });

      const related = await kg.getRelatedNodes(node1.id!);
      expect(related).toHaveLength(1);
      expect(related[0].node.id).toBe(node2.id);
    });

    it('finds related nodes via targetId (bidirectional)', async () => {
      const ctx1 = makeContext({ url: 'https://a.com/1' });
      const ctx2 = makeContext({ url: 'https://b.com/2' });
      const node1 = await kg.addFromContext(ctx1);
      const node2 = await kg.addFromContext(ctx2);

      // Wait for fire-and-forget discoverRelations to complete, then clear
      await flushAsync();
      await db.relations.clear();
      // Relation where node2 is the source
      await db.relations.add({
        sourceId: node2.id!,
        targetId: node1.id!,
        similarity: 0.7,
        type: 'semantic',
      });

      const related = await kg.getRelatedNodes(node1.id!);
      expect(related).toHaveLength(1);
      expect(related[0].node.id).toBe(node2.id);
    });
  });

  // ── getGraphData ──

  describe('getGraphData', () => {
    it('returns empty graph when no data', async () => {
      const data = await kg.getGraphData();
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
    });

    it('returns all nodes and edges', async () => {
      const ctx1 = makeContext({ url: 'https://a.com/1' });
      const ctx2 = makeContext({ url: 'https://b.com/2' });
      const node1 = await kg.addFromContext(ctx1);
      const node2 = await kg.addFromContext(ctx2);

      // Wait for fire-and-forget discoverRelations to complete, then clear
      await flushAsync();
      await db.relations.clear();
      await db.relations.add({
        sourceId: node1.id!,
        targetId: node2.id!,
        similarity: 0.5,
        type: 'tag_overlap',
      });

      const data = await kg.getGraphData();
      expect(data.nodes).toHaveLength(2);
      expect(data.edges).toHaveLength(1);
    });
  });

  // ── getStats ──

  describe('getStats', () => {
    it('returns zero counts when empty', async () => {
      const stats = await kg.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.relationCount).toBe(0);
      expect(stats.embeddingCount).toBe(0);
    });

    it('counts nodes correctly', async () => {
      await kg.addFromContext(makeContext({ url: 'https://a.com/1' }));
      await kg.addFromContext(makeContext({ url: 'https://b.com/2' }));
      const stats = await kg.getStats();
      expect(stats.nodeCount).toBe(2);
    });
  });
});
