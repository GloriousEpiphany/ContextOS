// ============================================================================
// ContextPrompt AI v4.0 - Knowledge Graph
// CRUD operations and relationship management for knowledge nodes.
// ============================================================================

import type {
  KnowledgeNode,
  NodeRelation,
  RelationType,
  CapturedContext,
} from '@/types/index';
import { db } from './db';
import { vectorStore } from './vector-store';
import { hybridSearch } from './search';
import { extractKeywords, createContextSummary } from '../nlp-engine';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Extract the hostname from a URL string. Returns an empty string on failure.
 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Compute the Jaccard similarity between two string arrays.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ----------------------------------------------------------------------------
// KnowledgeGraph
// ----------------------------------------------------------------------------

export class KnowledgeGraph {
  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  /**
   * Create a knowledge node from a captured context.
   * Generates tags from content using extractKeywords, stores the node in Dexie,
   * then triggers async embedding generation and relation discovery.
   */
  async addFromContext(context: CapturedContext): Promise<KnowledgeNode> {
    const contentForTags = [context.title, context.mainContent, context.selection]
      .filter(Boolean)
      .join(' ');
    const generatedTags = extractKeywords(contentForTags, 8);

    // Merge generated tags with any existing tags, deduplicating
    const allTags = Array.from(
      new Set([...context.tags, ...generatedTags].map((t) => t.toLowerCase())),
    );

    const summary = createContextSummary(context);
    const now = new Date().toISOString();

    const node: KnowledgeNode = {
      contextId: context.id,
      title: context.title,
      summary,
      url: context.url,
      content: context.mainContent || context.selection || context.description || '',
      tags: allTags,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };

    const id = await db.knowledgeNodes.add(node);
    node.id = id;

    // Add to keyword index
    hybridSearch.addNode(node);

    // Fire-and-forget: generate embedding and discover relations
    this.generateEmbeddingForNode(id).catch((err) =>
      console.warn('[KnowledgeGraph] Embedding generation failed for node', id, err),
    );
    this.discoverRelations(id).catch((err) =>
      console.warn('[KnowledgeGraph] Relation discovery failed for node', id, err),
    );

    return node;
  }

  // --------------------------------------------------------------------------
  // Embedding Generation
  // --------------------------------------------------------------------------

  /**
   * Generate and store an embedding for the given node.
   * Lazy-imports the embeddings module to avoid loading the heavy AI pipeline
   * until it is actually needed.
   */
  async generateEmbeddingForNode(nodeId: number): Promise<void> {
    const node = await db.knowledgeNodes.get(nodeId);
    if (!node) return;

    const { generateEmbedding } = await import('../ai/embeddings');

    const textToEmbed = [node.title, node.summary, node.content]
      .filter(Boolean)
      .join('\n')
      .substring(0, 2000);

    const vector = await generateEmbedding(textToEmbed);
    await vectorStore.storeEmbedding(nodeId, vector);
  }

  // --------------------------------------------------------------------------
  // Relation Discovery
  // --------------------------------------------------------------------------

  /**
   * Discover relations between the given node and all other nodes.
   * Checks three dimensions:
   *   1. Semantic similarity via vector search (threshold > 0.5)
   *   2. URL domain match
   *   3. Tag overlap (Jaccard similarity > 0.3)
   *
   * Newly discovered relations are stored in db.relations.
   */
  async discoverRelations(nodeId: number): Promise<NodeRelation[]> {
    const node = await db.knowledgeNodes.get(nodeId);
    if (!node) return [];

    const newRelations: NodeRelation[] = [];

    // Collect existing relations to avoid duplicates
    const existingRelations = await db.relations
      .where('sourceId')
      .equals(nodeId)
      .or('targetId')
      .equals(nodeId)
      .toArray();

    const existingPairs = new Set(
      existingRelations.map((r) => `${r.sourceId}-${r.targetId}-${r.type}`),
    );

    const hasRelation = (sourceId: number, targetId: number, type: RelationType): boolean => {
      return (
        existingPairs.has(`${sourceId}-${targetId}-${type}`) ||
        existingPairs.has(`${targetId}-${sourceId}-${type}`)
      );
    };

    // 1. Semantic similarity via vector search
    const embedding = await vectorStore.getByNodeId(nodeId);
    if (embedding) {
      const similar = await vectorStore.search(embedding.vector, 20, 0.5);
      for (const result of similar) {
        if (result.nodeId === nodeId) continue;
        if (hasRelation(nodeId, result.nodeId, 'semantic')) continue;

        const relation: NodeRelation = {
          sourceId: nodeId,
          targetId: result.nodeId,
          similarity: result.similarity,
          type: 'semantic',
        };
        newRelations.push(relation);
      }
    }

    // 2. URL domain match
    const nodeDomain = getDomain(node.url);
    if (nodeDomain) {
      const allNodes = await db.knowledgeNodes.toArray();
      for (const other of allNodes) {
        if (!other.id || other.id === nodeId) continue;
        if (hasRelation(nodeId, other.id, 'url_domain')) continue;

        const otherDomain = getDomain(other.url);
        if (otherDomain && otherDomain === nodeDomain) {
          newRelations.push({
            sourceId: nodeId,
            targetId: other.id,
            similarity: 1.0,
            type: 'url_domain',
          });
        }
      }
    }

    // 3. Tag overlap (Jaccard similarity > 0.3)
    if (node.tags.length > 0) {
      const allNodes = await db.knowledgeNodes.toArray();
      for (const other of allNodes) {
        if (!other.id || other.id === nodeId) continue;
        if (other.tags.length === 0) continue;
        if (hasRelation(nodeId, other.id, 'tag_overlap')) continue;

        const jaccard = jaccardSimilarity(node.tags, other.tags);
        if (jaccard > 0.3) {
          newRelations.push({
            sourceId: nodeId,
            targetId: other.id,
            similarity: jaccard,
            type: 'tag_overlap',
          });
        }
      }
    }

    // Persist all new relations
    if (newRelations.length > 0) {
      await db.relations.bulkAdd(newRelations);
    }

    return newRelations;
  }

  // --------------------------------------------------------------------------
  // Read
  // --------------------------------------------------------------------------

  /**
   * Retrieve a single knowledge node by its id.
   */
  async getNode(nodeId: number): Promise<KnowledgeNode | undefined> {
    return db.knowledgeNodes.get(nodeId);
  }

  /**
   * Get all nodes related to the given node, along with their relation metadata.
   */
  async getRelatedNodes(
    nodeId: number,
  ): Promise<Array<{ node: KnowledgeNode; relation: NodeRelation }>> {
    const relations = await db.relations
      .where('sourceId')
      .equals(nodeId)
      .or('targetId')
      .equals(nodeId)
      .toArray();

    const results: Array<{ node: KnowledgeNode; relation: NodeRelation }> = [];

    for (const relation of relations) {
      const relatedId = relation.sourceId === nodeId ? relation.targetId : relation.sourceId;
      const node = await db.knowledgeNodes.get(relatedId);
      if (node) {
        results.push({ node, relation });
      }
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------

  /**
   * Delete a knowledge node along with its embeddings and all associated relations.
   */
  async deleteNode(nodeId: number): Promise<void> {
    // Remove from keyword index
    hybridSearch.removeNode(nodeId);

    // Delete embeddings
    await vectorStore.deleteByNodeId(nodeId);

    // Delete relations where this node is either source or target
    await db.relations
      .where('sourceId')
      .equals(nodeId)
      .or('targetId')
      .equals(nodeId)
      .delete();

    // Delete the node itself
    await db.knowledgeNodes.delete(nodeId);
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Search knowledge nodes using hybrid search (vector + keyword).
   * Optionally generates an embedding for the query to enable semantic search.
   */
  async searchNodes(query: string): Promise<KnowledgeNode[]> {
    let queryVector: Float32Array | null = null;

    try {
      const { generateEmbedding } = await import('../ai/embeddings');
      queryVector = await generateEmbedding(query);
    } catch {
      // Embedding unavailable -- fall back to keyword-only search
    }

    const results = await hybridSearch.search(query, queryVector);

    return results
      .filter((r) => r.node != null)
      .map((r) => r.node as KnowledgeNode);
  }

  // --------------------------------------------------------------------------
  // Graph Data (for D3 visualization)
  // --------------------------------------------------------------------------

  /**
   * Return all nodes and relations for D3 visualization.
   */
  async getGraphData(): Promise<{ nodes: KnowledgeNode[]; edges: NodeRelation[] }> {
    const [nodes, edges] = await Promise.all([
      db.knowledgeNodes.toArray(),
      db.relations.toArray(),
    ]);
    return { nodes, edges };
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  /**
   * Return aggregate statistics about the knowledge graph.
   */
  async getStats(): Promise<{
    nodeCount: number;
    relationCount: number;
    embeddingCount: number;
  }> {
    const [nodeCount, relationCount, embeddingCount] = await Promise.all([
      db.knowledgeNodes.count(),
      db.relations.count(),
      vectorStore.count(),
    ]);
    return { nodeCount, relationCount, embeddingCount };
  }
}

// Singleton export
export const knowledgeGraph = new KnowledgeGraph();
