// ============================================================================
// ContextPrompt AI v4.0 - Hybrid Search (Vector + BM25 Keyword)
// ============================================================================

import MiniSearch from 'minisearch';
import type { KnowledgeNode } from '@/types/index';
import { db } from './db';
import { VectorStore } from './vector-store';
import type { SearchResult as VectorSearchResult } from './vector-store';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface SearchOptions {
  topK?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  timeDecayFactor?: number;
}

export interface HybridSearchResult {
  nodeId: number;
  score: number;
  vectorScore: number;
  keywordScore: number;
  node?: KnowledgeNode;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const DEFAULT_TOP_K = 10;
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_KEYWORD_WEIGHT = 0.4;
const DEFAULT_TIME_DECAY_FACTOR = 0.1;

/** RRF constant k -- standard value from the original RRF paper */
export const RRF_K = 60;

// ----------------------------------------------------------------------------
// HybridSearch
// ----------------------------------------------------------------------------

export class HybridSearch {
  private miniSearch: MiniSearch;
  private vectorStore: VectorStore;

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
    this.miniSearch = createMiniSearchInstance();
  }

  // --------------------------------------------------------------------------
  // Index Management
  // --------------------------------------------------------------------------

  /**
   * Rebuild the entire keyword index from all knowledge nodes in the database.
   * Call this on startup or after bulk operations.
   */
  async rebuildIndex(): Promise<void> {
    // Create a fresh MiniSearch to avoid stale document issues
    this.miniSearch = createMiniSearchInstance();

    const allNodes = await db.knowledgeNodes.toArray();
    if (allNodes.length === 0) return;

    const docs = allNodes
      .filter((node): node is KnowledgeNode & { id: number } => node.id != null)
      .map((node) => ({
        id: node.id,
        title: node.title,
        summary: node.summary,
        content: node.content,
        tags: node.tags.join(' '),
        url: node.url,
      }));

    this.miniSearch.addAll(docs);
  }

  /**
   * Add a single knowledge node to the keyword index.
   */
  addNode(node: KnowledgeNode): void {
    if (node.id == null) return;

    // Remove existing entry if present (MiniSearch throws on duplicate ids)
    this.safeRemove(node.id);

    this.miniSearch.add({
      id: node.id,
      title: node.title,
      summary: node.summary,
      content: node.content,
      tags: node.tags.join(' '),
      url: node.url,
    });
  }

  /**
   * Remove a node from the keyword index by its id.
   */
  removeNode(nodeId: number): void {
    this.safeRemove(nodeId);
  }

  // --------------------------------------------------------------------------
  // Hybrid Search
  // --------------------------------------------------------------------------

  /**
   * Perform a hybrid search combining vector similarity and keyword relevance
   * using Reciprocal Rank Fusion (RRF).
   *
   * @param query       The text query for keyword search.
   * @param queryVector The embedding of the query for vector search (null to skip).
   * @param options     Search tuning parameters.
   */
  async search(
    query: string,
    queryVector: Float32Array | null,
    options: SearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const {
      topK = DEFAULT_TOP_K,
      vectorWeight = DEFAULT_VECTOR_WEIGHT,
      keywordWeight = DEFAULT_KEYWORD_WEIGHT,
      timeDecayFactor = DEFAULT_TIME_DECAY_FACTOR,
    } = options;

    // -- Keyword search --
    const keywordResults = this.keywordSearch(query, topK * 3);

    // -- Vector search --
    let vectorResults: VectorSearchResult[] = [];
    if (queryVector !== null) {
      vectorResults = await this.vectorStore.search(queryVector, topK * 3);
    }

    // -- Merge with RRF --
    const merged = reciprocalRankFusion(
      keywordResults,
      vectorResults,
      keywordWeight,
      vectorWeight,
    );

    // -- Apply time-decay boost --
    if (timeDecayFactor > 0 && merged.length > 0) {
      await this.applyTimeDecay(merged, timeDecayFactor);
    }

    // -- Sort and truncate --
    merged.sort((a, b) => b.score - a.score);
    const topResults = merged.slice(0, topK);

    // -- Attach full node objects --
    await this.attachNodes(topResults);

    return topResults;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /**
   * Run a keyword-only search and return results in a normalized format.
   */
  private keywordSearch(
    query: string,
    limit: number,
  ): Array<{ nodeId: number; score: number }> {
    if (!query.trim()) return [];

    const results = this.miniSearch.search(query, {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'OR',
      boost: { title: 3, summary: 2, tags: 2, content: 1 },
    });

    return results.slice(0, limit).map((r) => ({
      nodeId: r.id as number,
      score: r.score,
    }));
  }

  /**
   * Apply a time-based decay boost: more recent nodes get a slight score bump.
   */
  private async applyTimeDecay(
    results: HybridSearchResult[],
    factor: number,
  ): Promise<void> {
    const nodeIds = results.map((r) => r.nodeId);
    const nodes = await db.knowledgeNodes.where('id').anyOf(nodeIds).toArray();
    const nodeMap = new Map(nodes.map((n) => [n.id!, n]));

    const now = Date.now();

    for (const result of results) {
      const node = nodeMap.get(result.nodeId);
      if (!node) continue;

      const lastAccessed = new Date(node.lastAccessedAt || node.createdAt).getTime();
      const ageHours = Math.max(1, (now - lastAccessed) / (1000 * 60 * 60));

      // Logarithmic decay: recent items get a small additive boost
      const recencyBoost = factor / Math.log2(ageHours + 1);
      result.score += recencyBoost;
    }
  }

  /**
   * Attach full KnowledgeNode objects to each search result.
   */
  private async attachNodes(results: HybridSearchResult[]): Promise<void> {
    if (results.length === 0) return;

    const nodeIds = results.map((r) => r.nodeId);
    const nodes = await db.knowledgeNodes.where('id').anyOf(nodeIds).toArray();
    const nodeMap = new Map(nodes.map((n) => [n.id!, n]));

    for (const result of results) {
      result.node = nodeMap.get(result.nodeId);
    }
  }

  /**
   * Safely remove a document from the MiniSearch index.
   * Swallows errors if the document is not in the index.
   */
  private safeRemove(id: number): void {
    try {
      this.miniSearch.discard(id);
    } catch {
      // Document not in index -- nothing to do
    }
  }
}

// ----------------------------------------------------------------------------
// Reciprocal Rank Fusion
// ----------------------------------------------------------------------------

/**
 * Merge two ranked result lists using Reciprocal Rank Fusion (RRF).
 *
 * RRF score for document d = sum over lists L of:
 *   weight_L / (k + rank_L(d))
 *
 * This avoids the need to normalize scores from different sources.
 */
export function reciprocalRankFusion(
  keywordResults: Array<{ nodeId: number; score: number }>,
  vectorResults: VectorSearchResult[],
  keywordWeight: number,
  vectorWeight: number,
): HybridSearchResult[] {
  const resultMap = new Map<number, HybridSearchResult>();

  const getOrCreate = (nodeId: number): HybridSearchResult => {
    let entry = resultMap.get(nodeId);
    if (!entry) {
      entry = { nodeId, score: 0, vectorScore: 0, keywordScore: 0 };
      resultMap.set(nodeId, entry);
    }
    return entry;
  };

  // Keyword contributions (rank = 1-based position)
  for (let rank = 0; rank < keywordResults.length; rank++) {
    const kr = keywordResults[rank];
    const entry = getOrCreate(kr.nodeId);
    const rrfScore = keywordWeight / (RRF_K + rank + 1);
    entry.score += rrfScore;
    entry.keywordScore = kr.score;
  }

  // Vector contributions
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const vr = vectorResults[rank];
    const entry = getOrCreate(vr.nodeId);
    const rrfScore = vectorWeight / (RRF_K + rank + 1);
    entry.score += rrfScore;
    entry.vectorScore = vr.similarity;
  }

  return Array.from(resultMap.values());
}

// ----------------------------------------------------------------------------
// MiniSearch Factory
// ----------------------------------------------------------------------------

function createMiniSearchInstance(): MiniSearch {
  return new MiniSearch({
    fields: ['title', 'summary', 'content', 'tags'],
    storeFields: [],
    idField: 'id',
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
    tokenize: (text: string) => {
      // Split on whitespace, punctuation, and CJK character boundaries
      // This handles both English and Chinese/Japanese/Korean text
      const tokens: string[] = [];
      // Standard word tokenization
      const words = text.toLowerCase().split(/[\s\-_.,;:!?'"()\[\]{}|/\\<>@#$%^&*+=~`]+/);
      for (const word of words) {
        if (!word) continue;
        // Check if word contains CJK characters
        if (/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/.test(word)) {
          // Bigram tokenization for CJK
          const chars = Array.from(word);
          for (let i = 0; i < chars.length; i++) {
            // Single character
            tokens.push(chars[i]);
            // Bigram
            if (i + 1 < chars.length) {
              tokens.push(chars[i] + chars[i + 1]);
            }
          }
        } else if (word.length > 0) {
          tokens.push(word);
        }
      }
      return tokens;
    },
  });
}

// Singleton export
export const hybridSearch = new HybridSearch(new VectorStore());
