/**
 * ContextPrompt AI v4.0 — Workflow Engine
 * Executes multi-step workflows that chain capture, AI, and knowledge operations.
 */

import type { Workflow, WorkflowExecution, WorkflowStep } from '@/types/index';

// ----------------------------------------------------------------------------
// Step Executors
// ----------------------------------------------------------------------------

type StepExecutor = (
  step: WorkflowStep,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

async function executeCapture(
  _step: WorkflowStep,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await chrome.runtime.sendMessage({
    action: 'getAllContexts',
  });
  const contexts = Array.isArray(response) ? response : [];
  const latest = contexts[0] || null;
  return { ...input, capturedContext: latest, contexts };
}

async function executeSummarize(
  _step: WorkflowStep,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const content =
    (input.capturedContext as { mainContent?: string; selection?: string })?.mainContent ||
    (input.capturedContext as { selection?: string })?.selection ||
    (input.content as string) ||
    '';

  if (!content) return { ...input, summary: '' };

  const response = await chrome.runtime.sendMessage({
    action: 'summarizeWithAI',
    data: { content, maxLength: 500 },
  });

  return { ...input, summary: response?.summary || '' };
}

async function executeSearchKnowledge(
  step: WorkflowStep,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query =
    (step.config.query as string) ||
    (input.summary as string) ||
    (input.capturedContext as { title?: string })?.title ||
    '';

  if (!query) return { ...input, knowledgeResults: [] };

  const response = await chrome.runtime.sendMessage({
    action: 'searchKnowledge',
    data: { query },
  });

  return { ...input, knowledgeResults: response?.results || [] };
}

async function executeGeneratePrompt(
  step: WorkflowStep,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const model = (step.config.model as string) || 'gpt-4o';
  const query =
    (step.config.query as string) ||
    (input.summary as string) ||
    '';

  const response = await chrome.runtime.sendMessage({
    action: 'assembleContext',
    data: { query, model },
  });

  return { ...input, contextPackage: response };
}

async function executeExport(
  _step: WorkflowStep,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Collect all workflow results into a report
  const report = {
    summary: input.summary || '',
    knowledgeResults: input.knowledgeResults || [],
    contextPackage: input.contextPackage || null,
    exportedAt: new Date().toISOString(),
  };

  return { ...input, exportReport: report };
}

const STEP_EXECUTORS: Record<string, StepExecutor> = {
  capture: executeCapture,
  summarize: executeSummarize,
  search_knowledge: executeSearchKnowledge,
  generate_prompt: executeGeneratePrompt,
  export: executeExport,
};

// ----------------------------------------------------------------------------
// WorkflowEngine
// ----------------------------------------------------------------------------

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();

  /**
   * Register a workflow.
   */
  addWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Remove a workflow.
   */
  removeWorkflow(id: string): void {
    this.workflows.delete(id);
  }

  /**
   * Get all registered workflows.
   */
  getWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get a workflow by ID.
   */
  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * Execute a workflow step-by-step.
   * Each step receives the accumulated output from all previous steps.
   */
  async execute(
    workflow: Workflow,
    initialContext: Record<string, unknown> = {},
  ): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      workflowId: workflow.id,
      status: 'running',
      currentStep: 0,
      results: [],
      startedAt: new Date().toISOString(),
    };

    let context = { ...initialContext };

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        execution.currentStep = i;
        const step = workflow.steps[i];

        const executor = STEP_EXECUTORS[step.type];
        if (!executor) {
          throw new Error(`Unknown step type: ${step.type}`);
        }

        context = await executor(step, context);
        execution.results.push({ step: step.id, type: step.type, output: context });
      }

      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
    } catch (error) {
      execution.status = 'failed';
      execution.error = (error as Error).message;
      execution.completedAt = new Date().toISOString();
    }

    return execution;
  }
}

export const workflowEngine = new WorkflowEngine();
