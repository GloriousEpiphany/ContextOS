// ============================================================================
// ContextPrompt AI v4.0 - Vector Store (Brute-force Cosine Similarity)
// ============================================================================

import type { NodeEmbedding } from '@/types/index';
import { db } from './db';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface SearchResult {
  nodeId: number;
  similarity: number;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const DEFAULT_TOP_K = 10;
const DEFAULT_THRESHOLD = 0.3;
const DEFAULT_MODEL = 'all-MiniLM-L6-v2';

// ----------------------------------------------------------------------------
// VectorStore
// ----------------------------------------------------------------------------

export class VectorStore {
  /**
   * Store an embedding vector for a knowledge node.
   * If an embedding already exists for this node, it is replaced.
   */
  async storeEmbedding(nodeId: number, vector: Float32Array, model?: string): Promise<void> {
    const existing = await db.embeddings.where('nodeId').equals(nodeId).first();

    const record: NodeEmbedding = {
      nodeId,
      vector,
      model: model ?? DEFAULT_MODEL,
      createdAt: new Date().toISOString(),
    };

    if (existing?.id != null) {
      record.id = existing.id;
      await db.embeddings.put(record);
    } else {
      await db.embeddings.add(record);
    }
  }

  /**
   * Search for the most similar embeddings to `queryVector` using brute-force
   * cosine similarity. Returns the top-K results whose similarity exceeds the
   * threshold, sorted descending by similarity.
   *
   * When there are >1000 embeddings, uses bucket pre-filtering by node tags/domain
   * to reduce the search space if filterNodeIds is provided.
   */
  async search(
    queryVector: Float32Array,
    topK: number = DEFAULT_TOP_K,
    threshold: number = DEFAULT_THRESHOLD,
    filterNodeIds?: Set<number>,
  ): Promise<SearchResult[]> {
    let allEmbeddings = await db.embeddings.toArray();

    if (allEmbeddings.length === 0) {
      return [];
    }

    // Bucket optimization: if >1000 embeddings and filter is provided, narrow scope
    if (filterNodeIds && filterNodeIds.size > 0 && allEmbeddings.length > 1000) {
      allEmbeddings = allEmbeddings.filter((e) => filterNodeIds.has(e.nodeId));
    }

    // Pre-compute query magnitude once
    const queryMag = magnitude(queryVector);
    if (queryMag === 0) {
      return [];
    }

    // Score every embedding
    const scored: SearchResult[] = [];

    for (const emb of allEmbeddings) {
      const vec = emb.vector instanceof Float32Array
        ? emb.vector
        : new Float32Array(emb.vector as unknown as ArrayLike<number>);

      const sim = cosineSimilarity(queryVector, vec, queryMag);

      if (sim >= threshold) {
        scored.push({ nodeId: emb.nodeId, similarity: sim });
      }
    }

    // Sort descending and take top-K
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Delete all embeddings associated with a knowledge node.
   */
  async deleteByNodeId(nodeId: number): Promise<void> {
    await db.embeddings.where('nodeId').equals(nodeId).delete();
  }

  /**
   * Get the embedding record for a specific node.
   */
  async getByNodeId(nodeId: number): Promise<NodeEmbedding | undefined> {
    return db.embeddings.where('nodeId').equals(nodeId).first();
  }

  /**
   * Return the total number of stored embeddings.
   */
  async count(): Promise<number> {
    return db.embeddings.count();
  }
}

// ----------------------------------------------------------------------------
// Math Utilities
// ----------------------------------------------------------------------------

/**
 * Compute the L2 magnitude of a vector.
 */
function magnitude(vec: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

/**
 * Compute cosine similarity between two vectors.
 * Accepts a pre-computed magnitude for the first vector to avoid redundant work
 * during batch comparisons.
 */
function cosineSimilarity(
  a: Float32Array,
  b: Float32Array,
  aMagnitude?: number,
): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let bSumSq = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    bSumSq += b[i] * b[i];
  }

  const magA = aMagnitude ?? magnitude(a);
  const magB = Math.sqrt(bSumSq);

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

// Singleton export for convenience
export const vectorStore = new VectorStore();
