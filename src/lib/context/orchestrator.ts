/**
 * ContextPrompt AI v4.0 — Context Orchestrator
 * Assembles context packages from knowledge graph, current page, and user query.
 */

import type { ContextPackage, KnowledgeNode } from '@/types/index';
import { allocateBudget, estimateTokens } from './budget';
import { compressText, formatContextPackage } from './compressor';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface AssembleOptions {
  model: string;
  currentPage?: { title: string; url: string; content: string } | null;
  systemPrompt?: string;
  topK?: number;
}

// ----------------------------------------------------------------------------
// ContextOrchestrator
// ----------------------------------------------------------------------------

export class ContextOrchestrator {
  /**
   * Assemble a context package for an AI prompt.
   *
   * 1. Search knowledge graph for related nodes
   * 2. Include current page context if available
   * 3. Allocate token budget per section
   * 4. Compress/truncate each section to fit
   * 5. Format into a structured context package
   */
  async assembleContext(
    userQuery: string,
    options: AssembleOptions,
  ): Promise<ContextPackage> {
    const {
      model,
      currentPage = null,
      systemPrompt = 'You are a helpful assistant. Use the provided context to answer the user\'s question.',
      topK = 5,
    } = options;

    // 1. Allocate token budget
    const budget = allocateBudget(model);

    // 2. Search knowledge graph for relevant nodes
    let knowledgeNodes: KnowledgeNode[] = [];
    if (userQuery.trim()) {
      try {
        const { knowledgeGraph } = await import('../storage/knowledge-graph');
        knowledgeNodes = await knowledgeGraph.searchNodes(userQuery);
        knowledgeNodes = knowledgeNodes.slice(0, topK);
      } catch {
        // Knowledge graph unavailable — continue without it
      }
    }

    // 3. Compress system prompt
    const compressedSystem = compressText(systemPrompt, budget.system);

    // 4. Compress current page context
    let compressedPage = '';
    if (currentPage) {
      const pageText = `${currentPage.title}\n${currentPage.url}\n${currentPage.content}`;
      compressedPage = compressText(pageText, budget.currentPage);
    }

    // 5. Compress knowledge context
    let compressedKnowledge = '';
    if (knowledgeNodes.length > 0) {
      const perNodeBudget = Math.floor(budget.knowledgeGraph / knowledgeNodes.length);
      const knowledgeParts: string[] = [];

      for (const node of knowledgeNodes) {
        const nodeText = `### ${node.title}\nURL: ${node.url}\nTags: ${node.tags.join(', ')}\n${node.summary}`;
        knowledgeParts.push(compressText(nodeText, perNodeBudget));
      }

      compressedKnowledge = knowledgeParts.join('\n\n');
    }

    // 6. Build the formatted context
    const userContext = formatContextPackage({
      currentPage: currentPage ? {
        title: currentPage.title,
        url: currentPage.url,
        content: compressedPage,
      } : null,
      knowledgeResults: knowledgeNodes.map((n) => ({
        title: n.title,
        summary: compressText(n.summary, Math.floor(budget.knowledgeGraph / Math.max(knowledgeNodes.length, 1))),
        url: n.url,
        tags: n.tags,
      })),
      userQuery,
    });

    // 7. Calculate total tokens used
    const totalTokens =
      estimateTokens(compressedSystem) +
      estimateTokens(userContext) +
      estimateTokens(compressedKnowledge);

    return {
      systemPrompt: compressedSystem,
      userContext,
      knowledgeContext: compressedKnowledge,
      metadata: {
        totalTokens,
        model,
        sections: [
          { name: 'system', tokens: estimateTokens(compressedSystem) },
          { name: 'userContext', tokens: estimateTokens(userContext) },
          { name: 'knowledgeGraph', tokens: estimateTokens(compressedKnowledge) },
        ],
      },
    };
  }
}

export const contextOrchestrator = new ContextOrchestrator();
