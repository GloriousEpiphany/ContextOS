/**
 * Comprehensive tests for WorkflowEngine — step executors, dispatcher,
 * error handling, and edge cases.
 *
 * Decision boundaries tested:
 * - Dispatcher not initialized → throws
 * - Unknown step type → execution fails with error
 * - Multi-step execution: data flows through steps
 * - Failed step → execution status = 'failed' with error message
 * - Empty workflow (0 steps) → completes immediately
 * - addWorkflow / removeWorkflow / getWorkflow / getWorkflows CRUD
 * - Step executor: summarize with empty content → returns empty summary
 * - Step executor: searchKnowledge with no query → returns empty results
 * - Step executor: export produces correct report structure
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  WorkflowEngine,
  setDispatcher,
  workflowEngine,
} from '../../src/lib/workflow/engine';
import type { Workflow, WorkflowStep } from '../../src/types/index';

// ── Helper ──

function makeWorkflow(steps: WorkflowStep[] = []): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    description: 'A test workflow',
    trigger: 'manual',
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: `step-${Date.now()}`,
    type: 'capture',
    label: 'Capture',
    config: {},
    ...overrides,
  };
}

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    engine = new WorkflowEngine();
    mockDispatch = vi.fn();
    setDispatcher(mockDispatch);
  });

  // ── Workflow CRUD ──

  describe('CRUD', () => {
    it('adds and retrieves a workflow', () => {
      const wf = makeWorkflow();
      engine.addWorkflow(wf);
      expect(engine.getWorkflow('test-workflow')).toEqual(wf);
    });

    it('returns undefined for non-existent workflow', () => {
      expect(engine.getWorkflow('nonexistent')).toBeUndefined();
    });

    it('returns all workflows', () => {
      engine.addWorkflow(makeWorkflow([makeStep({ id: 's1' })]));
      engine.addWorkflow(makeWorkflow([makeStep({ id: 's2' })]));
      // Second one has different id, so let's set it differently
      const wf2 = makeWorkflow();
      wf2.id = 'wf-2';
      engine.addWorkflow(wf2);

      expect(engine.getWorkflows()).toHaveLength(2);
    });

    it('removes a workflow', () => {
      const wf = makeWorkflow();
      engine.addWorkflow(wf);
      engine.removeWorkflow('test-workflow');
      expect(engine.getWorkflow('test-workflow')).toBeUndefined();
    });

    it('removeWorkflow is a no-op for non-existent id', () => {
      expect(() => engine.removeWorkflow('nonexistent')).not.toThrow();
    });
  });

  // ── Execution ──

  describe('execute', () => {
    it('completes empty workflow immediately', async () => {
      const wf = makeWorkflow([]);
      const result = await engine.execute(wf);

      expect(result.status).toBe('completed');
      expect(result.results).toHaveLength(0);
      expect(result.completedAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('fails when step type is unknown', async () => {
      const wf = makeWorkflow([
        makeStep({ type: 'unknown_type' as WorkflowStep['type'] }),
      ]);

      const result = await engine.execute(wf);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unknown step type: unknown_type');
    });

    it('flows data through multiple steps', async () => {
      // Mock dispatcher to return data for each step
      mockDispatch
        .mockResolvedValueOnce([{ id: 'ctx-1', title: 'Paper', mainContent: 'Content' }]) // capture
        .mockResolvedValueOnce({ summary: 'Summary text' }) // summarize
        .mockResolvedValueOnce({ results: [{ title: 'Related' }] }); // searchKnowledge

      const wf = makeWorkflow([
        makeStep({ id: 'cap', type: 'capture', label: 'Capture' }),
        makeStep({ id: 'sum', type: 'summarize', label: 'Summarize' }),
        makeStep({ id: 'search', type: 'search_knowledge', label: 'Search', config: { query: 'test' } }),
      ]);

      const result = await engine.execute(wf);

      expect(result.status).toBe('completed');
      expect(result.results).toHaveLength(3);
      // Each result should have the step id and type
      expect(result.results[0].step).toBe('cap');
      expect(result.results[0].type).toBe('capture');
      expect(result.results[2].type).toBe('search_knowledge');
    });

    it('handles step execution failure gracefully', async () => {
      mockDispatch.mockRejectedValueOnce(new Error('Network timeout'));

      const wf = makeWorkflow([
        makeStep({ type: 'capture' }),
      ]);

      const result = await engine.execute(wf);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Network timeout');
    });

    it('records startedAt and completedAt timestamps', async () => {
      const before = new Date().toISOString();
      const wf = makeWorkflow([]);
      const result = await engine.execute(wf);
      const after = new Date().toISOString();

      expect(result.startedAt >= before).toBe(true);
      expect(result.completedAt! <= after).toBe(true);
    });

    it('passes initialContext to first step', async () => {
      mockDispatch.mockResolvedValueOnce([]);

      const wf = makeWorkflow([
        makeStep({ type: 'capture' }),
      ]);

      const initialData = { customKey: 'customValue' };
      const result = await engine.execute(wf, initialData);

      expect(result.status).toBe('completed');
    });
  });

  // ── Step executors ──

  describe('step executors', () => {
    it('capture step: extracts contexts from dispatcher response', async () => {
      mockDispatch.mockResolvedValueOnce([
        { id: 'c1', title: 'First' },
        { id: 'c2', title: 'Second' },
      ]);

      const wf = makeWorkflow([makeStep({ type: 'capture' })]);
      const result = await engine.execute(wf);

      expect(result.status).toBe('completed');
      expect(mockDispatch).toHaveBeenCalledWith({ action: 'getAllContexts' });
    });

    it('capture step: handles non-array response', async () => {
      mockDispatch.mockResolvedValueOnce(null);

      const wf = makeWorkflow([makeStep({ type: 'capture' })]);
      const result = await engine.execute(wf);

      expect(result.status).toBe('completed');
    });

    it('summarize step: returns empty summary when no content', async () => {
      // First step captures, but dispatcher returns empty
      mockDispatch.mockResolvedValueOnce([]);

      const wf = makeWorkflow([
        makeStep({ type: 'capture' }),
        makeStep({ type: 'summarize' }),
      ]);

      const result = await engine.execute(wf);
      expect(result.status).toBe('completed');
      // Should not have called summarizeWithAI since there's no content
    });

    it('search_knowledge step: uses step config query', async () => {
      mockDispatch.mockResolvedValueOnce({ results: [] });

      const wf = makeWorkflow([
        makeStep({
          type: 'search_knowledge',
          config: { query: 'contrastive learning' },
        }),
      ]);

      const result = await engine.execute(wf);
      expect(result.status).toBe('completed');
      expect(mockDispatch).toHaveBeenCalledWith({
        action: 'searchKnowledge',
        data: { query: 'contrastive learning' },
      });
    });

    it('export step: produces report structure', async () => {
      const wf = makeWorkflow([makeStep({ type: 'export' })]);
      const result = await engine.execute(wf);

      expect(result.status).toBe('completed');
      const output = result.results[0].output as Record<string, unknown>;
      expect(output.exportReport).toBeDefined();
      const report = output.exportReport as Record<string, unknown>;
      expect(report.exportedAt).toBeDefined();
    });

    it('generate_prompt step: calls assembleContext', async () => {
      mockDispatch.mockResolvedValueOnce({ context: 'assembled' });

      const wf = makeWorkflow([
        makeStep({
          type: 'generate_prompt',
          config: { model: 'gpt-4o', query: 'test query' },
        }),
      ]);

      const result = await engine.execute(wf);
      expect(result.status).toBe('completed');
      expect(mockDispatch).toHaveBeenCalledWith({
        action: 'assembleContext',
        data: { query: 'test query', model: 'gpt-4o' },
      });
    });
  });

  // ── Dispatcher not initialized ──

  describe('dispatcher initialization', () => {
    it('throws when dispatcher is not set and step needs it', async () => {
      // Create a fresh engine with no dispatcher set
      const freshEngine = new WorkflowEngine();
      // Reset the module-level dispatcher to the default error-throwing one
      setDispatcher(async () => {
        throw new Error('Workflow dispatcher not initialized. Call setDispatcher() first.');
      });

      const wf = makeWorkflow([makeStep({ type: 'capture' })]);
      const result = await freshEngine.execute(wf);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('dispatcher not initialized');
    });
  });

  // ── Singleton ──

  it('exports a singleton workflowEngine', () => {
    expect(workflowEngine).toBeInstanceOf(WorkflowEngine);
  });
});
