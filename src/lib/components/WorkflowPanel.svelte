<script lang="ts">
  import { onMount } from 'svelte';

  interface Workflow {
    id: string;
    name: string;
    description: string;
    steps: { id: string; type: string; label: string }[];
  }

  interface ExecutionResult {
    status: 'running' | 'completed' | 'failed';
    currentStep: number;
    error?: string;
    results: unknown[];
  }

  // ── State ──
  let workflows = $state<Workflow[]>([]);
  let selectedWorkflow = $state<Workflow | null>(null);
  let execution = $state<ExecutionResult | null>(null);
  let loading = $state(false);
  let editingNew = $state(false);
  let newWorkflow = $state<{ name: string; description: string }>({ name: '', description: '' });
  let editingSteps = $state(false);
  let editSteps = $state<{ id: string; type: string; label: string; config: Record<string, unknown> }[]>([]);

  const STEP_TYPES = [
    { type: 'capture', label: 'Capture Page' },
    { type: 'summarize', label: 'AI Summarize' },
    { type: 'search_knowledge', label: 'Search Knowledge' },
    { type: 'generate_prompt', label: 'Generate Prompt' },
    { type: 'export', label: 'Export Report' },
  ];

  const stepIcons: Record<string, string> = {
    capture: 'M9 9a3 3 0 100-6 3 3 0 000 6zM9 9v6',
    summarize: 'M4 6h10M4 10h7M4 14h10',
    search_knowledge: 'M10.5 10.5L14 14M6 6a4 4 0 100 8 4 4 0 000-8z',
    generate_prompt: 'M4 4l10 5-10 5V4z',
    export: 'M9 3v8M5 8l4 4 4-4M3 14h12',
  };

  function sendMessage(action: string, data?: unknown): Promise<any> {
    return chrome.runtime.sendMessage({ action, data });
  }

  async function loadWorkflows() {
    try {
      const result = await sendMessage('getWorkflows');
      if (Array.isArray(result)) {
        workflows = result;
      } else if (result?.workflows) {
        workflows = result.workflows;
      }
    } catch {
      workflows = [];
    }
  }

  function selectWorkflow(wf: Workflow) {
    selectedWorkflow = wf;
    execution = null;
  }

  async function runWorkflow() {
    if (!selectedWorkflow) return;
    loading = true;
    execution = { status: 'running', currentStep: 0, results: [] };

    try {
      const result = await sendMessage('executeWorkflow', {
        workflowId: selectedWorkflow.id,
      });
      execution = result || { status: 'failed', currentStep: 0, results: [], error: 'No response' };
    } catch (err) {
      execution = {
        status: 'failed',
        currentStep: 0,
        results: [],
        error: (err as Error).message,
      };
    } finally {
      loading = false;
    }
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return;
    try {
      await sendMessage('deleteWorkflow', { id });
      selectedWorkflow = null;
      execution = null;
      await loadWorkflows();
    } catch {
      // ignore
    }
  }

  async function saveNewWorkflow() {
    if (!newWorkflow.name.trim()) return;
    try {
      await sendMessage('saveWorkflow', {
        id: crypto.randomUUID(),
        name: newWorkflow.name,
        description: newWorkflow.description,
        trigger: 'manual',
        steps: editSteps.length > 0 ? editSteps : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      editingNew = false;
      newWorkflow = { name: '', description: '' };
      editSteps = [];
      await loadWorkflows();
    } catch {
      // ignore
    }
  }

  function addStep() {
    editSteps = [...editSteps, {
      id: `step-${editSteps.length + 1}`,
      type: 'capture',
      label: 'Capture Page',
      config: {},
    }];
  }

  function removeStep(index: number) {
    editSteps = editSteps.filter((_, i) => i !== index);
  }

  function updateStepType(index: number, type: string) {
    const label = STEP_TYPES.find(s => s.type === type)?.label || type;
    editSteps = editSteps.map((s, i) => i === index ? { ...s, type, label } : s);
  }

  function startEditSteps() {
    if (selectedWorkflow) {
      editSteps = selectedWorkflow.steps.map(s => ({ ...s, config: (s as any).config || {} }));
      editingSteps = true;
    }
  }

  async function saveEditedSteps() {
    if (!selectedWorkflow) return;
    try {
      await sendMessage('saveWorkflow', {
        ...selectedWorkflow,
        steps: editSteps,
        updatedAt: new Date().toISOString(),
      });
      editingSteps = false;
      await loadWorkflows();
      // Refresh selected workflow
      const updated = workflows.find(w => w.id === selectedWorkflow!.id);
      if (updated) selectedWorkflow = updated;
    } catch {
      // ignore
    }
  }

  onMount(loadWorkflows);
</script>

<div class="wf">
  {#if !selectedWorkflow}
    <!-- Workflow List -->
    <div class="wf-list">
      <div class="wf-list-header">
        <h3>Workflows</h3>
        <span class="wf-count">{workflows.length}</span>
      </div>

      {#if editingNew}
        <div class="wf-new-editor">
          <input class="wf-new-input" type="text" placeholder="Workflow name" bind:value={newWorkflow.name} />
          <input class="wf-new-input" type="text" placeholder="Description" bind:value={newWorkflow.description} />
          <!-- Step Editor -->
          <div class="wf-step-editor">
            <div class="wf-step-editor-header">
              <span class="wf-step-editor-title">Steps</span>
              <button class="wf-step-add" onclick={addStep}>+ Add Step</button>
            </div>
            {#each editSteps as step, i}
              <div class="wf-step-row">
                <span class="wf-step-num">{i + 1}</span>
                <select class="wf-step-select" value={step.type} onchange={(e) => updateStepType(i, (e.target as HTMLSelectElement).value)}>
                  {#each STEP_TYPES as st}
                    <option value={st.type}>{st.label}</option>
                  {/each}
                </select>
                <button class="wf-step-remove" onclick={() => removeStep(i)} title="Remove step">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/>
                  </svg>
                </button>
              </div>
            {/each}
            {#if editSteps.length === 0}
              <p class="wf-step-empty">No steps added yet</p>
            {/if}
          </div>
          <div class="wf-new-actions">
            <button class="wf-run" style="padding:8px;" onclick={saveNewWorkflow}>Save</button>
            <button class="wf-back" onclick={() => { editingNew = false; editSteps = []; }}>Cancel</button>
          </div>
        </div>
      {:else if workflows.length === 0}
        <div class="wf-empty">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="6" y="4" width="10" height="8" rx="2" stroke="var(--cp-slate-300, #cbd5e1)" stroke-width="1.2"/>
            <rect x="20" y="24" width="10" height="8" rx="2" stroke="var(--cp-slate-300, #cbd5e1)" stroke-width="1.2"/>
            <path d="M11 12v6a3 3 0 003 3h8a3 3 0 003-3v-6" stroke="var(--cp-slate-300, #cbd5e1)" stroke-width="1.2" fill="none" stroke-dasharray="3 2"/>
            <line x1="25" y1="18" x2="25" y2="24" stroke="var(--cp-slate-300, #cbd5e1)" stroke-width="1.2"/>
          </svg>
          <p>No workflows available</p>
          <p class="wf-empty-sub">Preset workflows will appear here</p>
        </div>
      {:else}
        <div class="wf-cards">
          {#each workflows as wf}
            <button class="wf-card" onclick={() => selectWorkflow(wf)}>
              <div class="wf-card-head">
                <span class="wf-card-name">{wf.name}</span>
                <span class="wf-card-badge">{wf.steps.length} steps</span>
              </div>
              <p class="wf-card-desc">{wf.description}</p>
              <div class="wf-card-steps-preview">
                {#each wf.steps.slice(0, 4) as step, i}
                  <span class="wf-step-dot" title={step.label}>
                    {i + 1}
                  </span>
                  {#if i < Math.min(wf.steps.length, 4) - 1}
                    <span class="wf-step-arrow">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="var(--cp-slate-300, #cbd5e1)" stroke-width="1">
                        <path d="M1 4h6M5 1.5L7.5 4 5 6.5"/>
                      </svg>
                    </span>
                  {/if}
                {/each}
                {#if wf.steps.length > 4}
                  <span class="wf-step-more">+{wf.steps.length - 4}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
      {#if !editingNew}
        <div style="padding: 8px 12px;">
          <button class="wf-run" style="padding:8px; font-size:13px;" onclick={() => (editingNew = true)}>
            + New Workflow
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Workflow Detail -->
    <div class="wf-detail">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <button class="wf-back" onclick={() => { selectedWorkflow = null; execution = null; }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 1.5L3 6l5 4.5"/>
          </svg>
          Back to workflows
        </button>
        <button class="wf-del-btn" title="Delete workflow" onclick={() => deleteWorkflow(selectedWorkflow!.id)}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4"/>
          </svg>
        </button>
      </div>

      <div class="wf-detail-info">
        <h3>{selectedWorkflow.name}</h3>
        <p>{selectedWorkflow.description}</p>
      </div>

      <!-- Steps Timeline / Editor -->
      {#if editingSteps}
        <div class="wf-step-editor">
          <div class="wf-step-editor-header">
            <span class="wf-step-editor-title">Edit Steps</span>
            <button class="wf-step-add" onclick={addStep}>+ Add Step</button>
          </div>
          {#each editSteps as step, i}
            <div class="wf-step-row">
              <span class="wf-step-num">{i + 1}</span>
              <select class="wf-step-select" value={step.type} onchange={(e) => updateStepType(i, (e.target as HTMLSelectElement).value)}>
                {#each STEP_TYPES as st}
                  <option value={st.type}>{st.label}</option>
                {/each}
              </select>
              <button class="wf-step-remove" onclick={() => removeStep(i)} title="Remove step">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/>
                </svg>
              </button>
            </div>
          {/each}
          {#if editSteps.length === 0}
            <p class="wf-step-empty">No steps — add at least one</p>
          {/if}
          <div class="wf-new-actions" style="margin-top:10px;">
            <button class="wf-run" style="padding:8px;" onclick={saveEditedSteps}>Save Steps</button>
            <button class="wf-back" onclick={() => (editingSteps = false)}>Cancel</button>
          </div>
        </div>
      {:else}
        <div class="wf-timeline-header">
          <button class="wf-edit-steps-btn" onclick={startEditSteps}>Edit Steps</button>
        </div>
        <div class="wf-timeline">
        {#each selectedWorkflow.steps as step, i}
          <div
            class="wf-tl-step"
            class:active={execution?.status === 'running' && execution.currentStep === i}
            class:done={execution && i < (execution.currentStep ?? 0)}
            class:failed={execution?.status === 'failed' && execution.currentStep === i}
          >
            <div class="wf-tl-indicator">
              <div class="wf-tl-circle">
                {#if execution && i < (execution.currentStep ?? 0)}
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2.5 6L5 8.5L9.5 3.5"/>
                  </svg>
                {:else}
                  {i + 1}
                {/if}
              </div>
              {#if i < selectedWorkflow.steps.length - 1}
                <div class="wf-tl-line"></div>
              {/if}
            </div>
            <div class="wf-tl-content">
              <span class="wf-tl-label">{step.label}</span>
              <span class="wf-tl-type">{step.type}</span>
            </div>
          </div>
        {/each}
      </div>
      {/if}

      <!-- Run Button -->
      <button class="wf-run" onclick={runWorkflow} disabled={loading}>
        {#if loading}
          <span class="wf-run-spinner"></span>
          Running...
        {:else}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3 1.5v11l9-5.5L3 1.5z"/>
          </svg>
          Run Workflow
        {/if}
      </button>

      <!-- Execution Result -->
      {#if execution && execution.status !== 'running'}
        <div class="wf-result" class:wf-result-ok={execution.status === 'completed'} class:wf-result-err={execution.status === 'failed'}>
          <div class="wf-result-head">
            {#if execution.status === 'completed'}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent-strong)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="8" r="6"/>
                <path d="M5.5 8L7.5 10L10.5 6"/>
              </svg>
              <span>Completed</span>
            {:else}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="8" r="6"/>
                <path d="M8 5v3M8 10v.5"/>
              </svg>
              <span>Failed</span>
            {/if}
          </div>
          {#if execution.error}
            <p class="wf-result-error">{execution.error}</p>
          {/if}
          {#if execution.results.length > 0}
            <details class="wf-result-data">
              <summary>View results ({execution.results.length} steps)</summary>
              <pre>{JSON.stringify(execution.results, null, 2)}</pre>
            </details>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wf {
    height: 100%;
    display: flex;
    flex-direction: column;
    font-family: inherit;
  }

  /* List View */
  .wf-list {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .wf-list-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
  }

  .wf-list-header h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: var(--cp-slate-800, #1e293b);
  }

  .wf-count {
    font-size: 11px;
    font-weight: 600;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-500, #64748b);
    padding: 1px 8px;
    border-radius: 10px;
  }

  .wf-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--cp-slate-400, #94a3b8);
    font-size: 13px;
    padding: 40px 16px;
  }
  .wf-empty p { margin: 0; }
  .wf-empty-sub { font-size: 11px; color: var(--cp-slate-300, #cbd5e1); }

  .wf-cards {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
  }

  .wf-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 14px;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
    border-radius: 12px;
    background: var(--cp-white, white);
    cursor: pointer;
    margin-bottom: 8px;
    transition: all 200ms;
    font-family: inherit;
    color: inherit;
  }
  .wf-card:hover {
    border-color: var(--cp-teal-300, #5eead4);
    box-shadow: 0 2px 8px rgba(20, 184, 166, 0.08);
  }

  .wf-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .wf-card-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--cp-slate-800, #1e293b);
  }

  .wf-card-badge {
    font-size: 10px;
    font-weight: 500;
    color: var(--cp-teal-700, var(--accent-strong));
    background: var(--cp-teal-50, #f0fdfa);
    padding: 2px 8px;
    border-radius: 10px;
  }

  .wf-card-desc {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin: 0 0 10px;
    line-height: 1.4;
  }

  .wf-card-steps-preview {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .wf-step-dot {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-500, #64748b);
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .wf-step-arrow { display: flex; align-items: center; }

  .wf-step-more {
    font-size: 10px;
    color: var(--cp-slate-400, #94a3b8);
    margin-left: 2px;
  }

  /* Detail View */
  .wf-detail {
    flex: 1;
    padding: 14px 16px;
    overflow-y: auto;
  }

  .wf-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--cp-teal-600, var(--accent-strong));
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    margin-bottom: 14px;
    font-weight: 500;
    font-family: inherit;
  }
  .wf-back:hover { color: var(--cp-teal-700, var(--accent-strong)); }

  .wf-detail-info { margin-bottom: 18px; }

  .wf-detail-info h3 {
    font-size: 17px;
    font-weight: 700;
    margin: 0 0 4px;
    color: var(--cp-slate-900, #0f172a);
  }

  .wf-detail-info p {
    font-size: 13px;
    color: var(--cp-slate-500, #64748b);
    margin: 0;
    line-height: 1.5;
  }

  /* Timeline */
  .wf-timeline {
    margin-bottom: 18px;
  }

  .wf-tl-step {
    display: flex;
    gap: 12px;
  }

  .wf-tl-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }

  .wf-tl-circle {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-500, #64748b);
    font-size: 11px;
    font-weight: 600;
    border: 2px solid var(--cp-slate-200, #e2e8f0);
    transition: all 200ms;
  }

  .wf-tl-step.active .wf-tl-circle {
    background: var(--cp-teal-500, #14b8a6);
    border-color: var(--cp-teal-300, #5eead4);
    color: white;
    box-shadow: 0 0 12px rgba(20, 184, 166, 0.3);
  }

  .wf-tl-step.done .wf-tl-circle {
    background: var(--cp-teal-600, var(--accent));
    border-color: var(--cp-teal-500, #14b8a6);
    color: white;
  }

  .wf-tl-step.failed .wf-tl-circle {
    background: var(--cp-danger, #ef4444);
    border-color: var(--cp-danger, #ef4444);
    color: white;
  }

  .wf-tl-line {
    width: 2px;
    height: 16px;
    background: var(--cp-slate-200, #e2e8f0);
    margin: 2px 0;
  }

  .wf-tl-step.done .wf-tl-line {
    background: var(--cp-teal-300, #5eead4);
  }

  .wf-tl-content {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0 18px;
    min-height: 26px;
  }

  .wf-tl-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--cp-slate-700, #334155);
  }

  .wf-tl-type {
    font-size: 10px;
    color: var(--cp-slate-400, #94a3b8);
    background: var(--cp-slate-50, #f8fafc);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
  }

  /* Run Button */
  .wf-run {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px;
    border: none;
    border-radius: 12px;
    background: var(--accent);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms;
    font-family: inherit;
    box-shadow: 0 2px 8px rgba(194, 65, 12, 0.25);
  }
  .wf-run:disabled { opacity: 0.6; cursor: not-allowed; }
  .wf-run:hover:not(:disabled) {
    box-shadow: 0 4px 14px rgba(194, 65, 12, 0.35);
  }

  .wf-run-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Result */
  .wf-result {
    margin-top: 14px;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid;
  }

  .wf-result-ok {
    background: var(--cp-teal-50, #f0fdfa);
    border-color: var(--cp-teal-200, #99f6e4);
  }

  .wf-result-err {
    background: var(--cp-danger-light, #fee2e2);
    border-color: var(--cp-danger, #ef4444);
  }

  .wf-result-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 14px;
    color: var(--cp-teal-700, var(--accent-strong));
  }

  .wf-result-err .wf-result-head { color: var(--cp-danger, #ef4444); }

  .wf-result-error {
    font-size: 12px;
    color: var(--cp-danger, #ef4444);
    margin: 6px 0 0;
    line-height: 1.4;
  }

  .wf-result-data {
    margin-top: 10px;
    font-size: 12px;
  }

  .wf-result-data summary {
    cursor: pointer;
    color: var(--cp-slate-500, #64748b);
    font-weight: 500;
  }

  .wf-result-data pre {
    margin: 8px 0 0;
    padding: 10px;
    background: var(--cp-white, white);
    border-radius: 8px;
    font-size: 11px;
    overflow-x: auto;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
    font-family: var(--cp-font-mono, monospace);
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* New workflow editor */
  .wf-new-editor { padding: 12px; }
  .wf-new-input {
    width: 100%; padding: 8px 10px; border: 1px solid var(--cp-slate-200, #e2e8f0); border-radius: 8px;
    font-size: 13px; outline: none; background: var(--cp-white, white); margin-bottom: 8px; font-family: inherit; box-sizing: border-box;
  }
  .wf-new-input:focus { border-color: var(--cp-teal-400, #2dd4bf); }
  .wf-new-actions { display: flex; gap: 8px; align-items: center; }

  /* Delete button in detail view */
  .wf-del-btn {
    display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border: 1px solid var(--cp-slate-200, #e2e8f0); border-radius: 8px; background: var(--cp-white, white);
    cursor: pointer; color: var(--cp-slate-400, #94a3b8); transition: all 150ms;
  }
  .wf-del-btn:hover { color: var(--cp-danger, #ef4444); border-color: var(--cp-danger, #ef4444); background: var(--cp-danger-light, #fee2e2); }

  /* Step Editor */
  .wf-step-editor { padding: 0 0 12px; }
  .wf-step-editor-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .wf-step-editor-title { font-size: 13px; font-weight: 600; color: var(--cp-slate-700, #334155); }
  .wf-step-add {
    font-size: 12px; font-weight: 500; color: var(--cp-teal-600, var(--accent-strong));
    background: none; border: 1px solid var(--cp-teal-300, #5eead4); border-radius: 6px;
    padding: 3px 10px; cursor: pointer; font-family: inherit;
  }
  .wf-step-add:hover { background: var(--cp-teal-50, #f0fdfa); }
  .wf-step-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 0;
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
  }
  .wf-step-num {
    width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: var(--cp-slate-100, #f1f5f9); color: var(--cp-slate-500, #64748b);
    font-size: 11px; font-weight: 600; flex-shrink: 0;
  }
  .wf-step-select {
    flex: 1; padding: 6px 8px; border: 1px solid var(--cp-slate-200, #e2e8f0); border-radius: 6px;
    font-size: 12px; background: var(--cp-white, white); font-family: inherit; outline: none;
  }
  .wf-step-select:focus { border-color: var(--cp-teal-400, #2dd4bf); }
  .wf-step-remove {
    display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
    border: none; background: none; cursor: pointer; color: var(--cp-slate-400, #94a3b8);
    border-radius: 4px; flex-shrink: 0;
  }
  .wf-step-remove:hover { color: var(--cp-danger, #ef4444); background: var(--cp-danger-light, #fee2e2); }
  .wf-step-empty { font-size: 12px; color: var(--cp-slate-400, #94a3b8); text-align: center; padding: 12px 0; margin: 0; }

  /* Timeline header with edit button */
  .wf-timeline-header { display: flex; justify-content: flex-end; margin-bottom: 8px; }
  .wf-edit-steps-btn {
    font-size: 12px; font-weight: 500; color: var(--cp-teal-600, var(--accent-strong));
    background: none; border: 1px solid var(--cp-teal-200, #99f6e4); border-radius: 6px;
    padding: 4px 10px; cursor: pointer; font-family: inherit;
  }
  .wf-edit-steps-btn:hover { background: var(--cp-teal-50, #f0fdfa); }
</style>
