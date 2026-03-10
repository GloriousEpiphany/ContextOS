<script lang="ts">
  import { onMount } from 'svelte';
  import KnowledgeGraph from '@/lib/components/KnowledgeGraph.svelte';
  import WorkflowPanel from '@/lib/components/WorkflowPanel.svelte';

  // ── Types ──
  interface KnowledgeNode {
    id: number;
    title: string;
    summary: string;
    content: string;
    url: string;
    tags: string[];
    timestamp: string;
    accessCount: number;
    aiSummary?: string;
    description?: string;
    contextId?: string;
  }

  interface NodeRelation {
    sourceId: number;
    targetId: number;
    similarity: number;
    type: string;
  }

  // ── State ──
  let tab = $state<'knowledge' | 'graph' | 'workflows'>('knowledge');
  let nodes = $state<KnowledgeNode[]>([]);
  let selectedNode = $state<KnowledgeNode | null>(null);
  let searchQuery = $state('');
  let searchResults = $state<KnowledgeNode[]>([]);
  let loading = $state(false);
  let notification = $state<{ text: string; type: string } | null>(null);
  let graphNodes = $state<KnowledgeNode[]>([]);
  let graphEdges = $state<NodeRelation[]>([]);
  let stats = $state({ nodes: 0, relations: 0, tags: 0 });

  // ── Computed ──
  let displayedNodes = $derived(
    searchQuery.trim() ? searchResults : nodes
  );

  // ── Messaging ──
  function sendMessage(action: string, data?: any): Promise<any> {
    return chrome.runtime.sendMessage({ action, data });
  }

  function showNotification(text: string, type = 'success') {
    notification = { text, type };
    setTimeout(() => (notification = null), 3000);
  }

  function formatDate(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── Search ──
  let searchTimeout: ReturnType<typeof setTimeout>;

  function handleSearchInput() {
    clearTimeout(searchTimeout);
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    searchTimeout = setTimeout(async () => {
      loading = true;
      try {
        const results = await sendMessage('searchKnowledge', { query: searchQuery });
        searchResults = results || [];
      } catch {
        searchResults = [];
      } finally {
        loading = false;
      }
    }, 300);
  }

  // ── Actions ──
  function selectNode(node: KnowledgeNode) {
    selectedNode = node;
  }

  function clearSelection() {
    selectedNode = null;
  }

  function handleGraphNodeClick(node: KnowledgeNode) {
    selectedNode = node;
    tab = 'knowledge';
  }

  async function addCurrentPage() {
    loading = true;
    try {
      const [tabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabInfo?.id || !tabInfo.url || tabInfo.url.startsWith('chrome://')) {
        showNotification('Cannot capture this page', 'error');
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tabInfo.id },
        files: ['/content-scripts/capture.js'],
      });
      await new Promise((r) => setTimeout(r, 300));
      const response = await chrome.tabs.sendMessage(tabInfo.id, {
        action: 'captureContext',
        options: { captureDepth: 'standard' },
      });
      if (response?.success) {
        await sendMessage('saveContext', response.context);
        showNotification('Page added to knowledge base');
        await loadNodes();
        await loadGraphData();
      } else {
        showNotification('Capture failed', 'error');
      }
    } catch {
      showNotification('Failed to add page', 'error');
    } finally {
      loading = false;
    }
  }

  async function deleteNode(node: KnowledgeNode) {
    if (node.contextId) {
      await sendMessage('deleteContext', { id: node.contextId });
    }
    showNotification('Node removed');
    if (selectedNode?.id === node.id) selectedNode = null;
    await loadNodes();
    await loadGraphData();
  }

  async function exportKnowledge() {
    try {
      const data = await sendMessage('exportData');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contextprompt-knowledge-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Knowledge exported');
    } catch {
      showNotification('Export failed', 'error');
    }
  }

  // ── Data Loading ──
  async function loadNodes() {
    const result = (await sendMessage('getAllContexts')) || [];
    nodes = result;
  }

  async function loadGraphData() {
    try {
      const result = await sendMessage('getKnowledgeGraphData');
      if (result) {
        graphNodes = result.nodes || [];
        graphEdges = result.edges || [];
      }
    } catch { /* ignore */ }
  }

  async function loadStats() {
    try {
      const result = await sendMessage('getKnowledgeStats');
      if (result) {
        stats = {
          nodes: result.totalNodes || 0,
          relations: result.totalRelations || 0,
          tags: result.uniqueTags || 0,
        };
      }
    } catch { /* ignore */ }
  }

  onMount(async () => {
    await Promise.all([loadNodes(), loadGraphData(), loadStats()]);
  });
</script>

<div class="sp">
  <!-- Notification Toast -->
  {#if notification}
    <div class="toast" class:toast-s={notification.type === 'success'} class:toast-e={notification.type === 'error'}>
      {notification.text}
    </div>
  {/if}

  <!-- Header -->
  <header class="sp-header">
    <div class="sp-brand">
      <div class="sp-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#sg1)" opacity="0.9"/>
          <path d="M2 17l10 5 10-5" stroke="url(#sg1)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <path d="M2 12l10 5 10-5" stroke="url(#sg1)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <defs>
            <linearGradient id="sg1" x1="2" y1="2" x2="22" y2="22">
              <stop stop-color="#14b8a6"/>
              <stop offset="1" stop-color="#0f766e"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span class="sp-brand-name">ContextPrompt AI</span>
    </div>
    <div class="sp-stats-mini">
      <span class="sp-stat-chip">{stats.nodes} nodes</span>
      <span class="sp-stat-chip">{stats.relations} links</span>
    </div>
  </header>

  <!-- Tab Navigation -->
  <nav class="sp-tabs">
    <button class="sp-tab" class:active={tab === 'knowledge'} onclick={() => (tab = 'knowledge')}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="1" width="12" height="14" rx="2"/>
        <line x1="5" y1="5" x2="11" y2="5"/>
        <line x1="5" y1="8" x2="11" y2="8"/>
        <line x1="5" y1="11" x2="9" y2="11"/>
      </svg>
      Knowledge
    </button>
    <button class="sp-tab" class:active={tab === 'graph'} onclick={() => (tab = 'graph')}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="4" cy="4" r="2"/>
        <circle cx="12" cy="4" r="2"/>
        <circle cx="8" cy="13" r="2"/>
        <line x1="5.5" y1="5.5" x2="6.8" y2="11.2"/>
        <line x1="10.5" y1="5.5" x2="9.2" y2="11.2"/>
        <line x1="6" y1="4" x2="10" y2="4"/>
      </svg>
      Graph
    </button>
    <button class="sp-tab" class:active={tab === 'workflows'} onclick={() => (tab = 'workflows')}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="5" height="4" rx="1"/>
        <rect x="9" y="10" width="5" height="4" rx="1"/>
        <path d="M4.5 6v2a2 2 0 002 2h3a2 2 0 002-2V6" fill="none"/>
        <line x1="11.5" y1="6" x2="11.5" y2="10"/>
      </svg>
      Workflows
    </button>
  </nav>

  <!-- Search Bar (Knowledge & Graph tabs) -->
  {#if tab !== 'workflows'}
    <div class="sp-search">
      <div class="sp-search-wrap">
        <svg class="sp-search-ico" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4">
          <circle cx="6" cy="6" r="4.5"/>
          <line x1="9.5" y1="9.5" x2="12.5" y2="12.5"/>
        </svg>
        <input
          type="text"
          class="sp-search-input"
          placeholder="Search knowledge base..."
          bind:value={searchQuery}
          oninput={handleSearchInput}
        />
        {#if loading}
          <span class="sp-spinner"></span>
        {/if}
        {#if searchQuery.trim()}
          <button class="sp-search-clear" title="Clear search" onclick={() => { searchQuery = ''; searchResults = []; }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="3" y1="3" x2="9" y2="9"/>
              <line x1="9" y1="3" x2="3" y2="9"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Main Content -->
  <div class="sp-main">
    {#if tab === 'knowledge'}
      <!-- Knowledge List + Detail -->
      <div class="sp-split">
        <!-- Left: Node List -->
        <div class="sp-left">
          <div class="sp-list-info">
            <span>{displayedNodes.length} {displayedNodes.length === 1 ? 'node' : 'nodes'}</span>
          </div>
          <div class="sp-nodes">
            {#if displayedNodes.length === 0}
              <div class="sp-empty">
                {#if searchQuery.trim()}
                  <p>No results for "{searchQuery}"</p>
                {:else}
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="5" y="3" width="22" height="26" rx="3" stroke="var(--cp-slate-300)" stroke-width="1.2"/>
                    <line x1="10" y1="10" x2="22" y2="10" stroke="var(--cp-slate-200)" stroke-width="1.2" stroke-linecap="round"/>
                    <line x1="10" y1="15" x2="22" y2="15" stroke="var(--cp-slate-200)" stroke-width="1.2" stroke-linecap="round"/>
                    <line x1="10" y1="20" x2="18" y2="20" stroke="var(--cp-slate-200)" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                  <p>No knowledge nodes yet</p>
                  <p class="sp-empty-sub">Add pages to get started</p>
                {/if}
              </div>
            {:else}
              {#each displayedNodes as node}
                <button
                  class="sp-node"
                  class:selected={selectedNode?.id === node.id}
                  onclick={() => selectNode(node)}
                >
                  <div class="sp-node-title">{node.title || 'Untitled'}</div>
                  <p class="sp-node-summary">{node.aiSummary || node.summary || node.description || ''}</p>
                  {#if node.tags?.length > 0}
                    <div class="sp-node-tags">
                      {#each node.tags.slice(0, 3) as tag}
                        <span class="sp-tag">{tag}</span>
                      {/each}
                      {#if node.tags.length > 3}
                        <span class="sp-tag sp-tag-more">+{node.tags.length - 3}</span>
                      {/if}
                    </div>
                  {/if}
                  <span class="sp-node-date">{formatDate(node.timestamp)}</span>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Right: Detail -->
        <div class="sp-right">
          {#if selectedNode}
            <div class="sp-detail">
              <div class="sp-detail-head">
                <button class="sp-detail-back" onclick={clearSelection}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 2L4 7l5 5"/>
                  </svg>
                  Back
                </button>
                <button class="sp-detail-del" onclick={() => deleteNode(selectedNode)} title="Delete this node">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4"/>
                  </svg>
                </button>
              </div>
              <div class="sp-detail-body">
                <h2 class="sp-detail-title">{selectedNode.title}</h2>
                {#if selectedNode.url}
                  <a href={selectedNode.url} target="_blank" rel="noopener" class="sp-detail-url">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 1H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V7"/>
                      <path d="M7 1h4v4M11 1L5 7"/>
                    </svg>
                    {selectedNode.url}
                  </a>
                {/if}
                <div class="sp-detail-meta">
                  <span>{formatDate(selectedNode.timestamp)}</span>
                  {#if selectedNode.accessCount > 0}
                    <span>{selectedNode.accessCount} views</span>
                  {/if}
                </div>
                {#if selectedNode.tags?.length > 0}
                  <div class="sp-detail-tags">
                    {#each selectedNode.tags as tag}
                      <span class="sp-tag">{tag}</span>
                    {/each}
                  </div>
                {/if}
                <div class="sp-detail-sections">
                  {#if selectedNode.aiSummary || selectedNode.summary || selectedNode.description}
                    <div class="sp-section">
                      <h3>Summary</h3>
                      <p>{selectedNode.aiSummary || selectedNode.summary || selectedNode.description}</p>
                    </div>
                  {/if}
                  {#if selectedNode.content}
                    <div class="sp-section">
                      <h3>Content</h3>
                      <p class="sp-content-text">{selectedNode.content}</p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="sp-detail-placeholder">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="8" y="6" width="24" height="28" rx="3" stroke="var(--cp-slate-300)" stroke-width="1.2"/>
                <line x1="13" y1="14" x2="27" y2="14" stroke="var(--cp-slate-200)" stroke-width="1.2" stroke-linecap="round"/>
                <line x1="13" y1="20" x2="27" y2="20" stroke="var(--cp-slate-200)" stroke-width="1.2" stroke-linecap="round"/>
                <line x1="13" y1="26" x2="22" y2="26" stroke="var(--cp-slate-200)" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              <p>Select a node to view details</p>
            </div>
          {/if}
        </div>
      </div>

    {:else if tab === 'graph'}
      <!-- Knowledge Graph Visualization -->
      <div class="sp-graph-wrap">
        <KnowledgeGraph nodes={graphNodes} edges={graphEdges} onNodeClick={handleGraphNodeClick} />
      </div>

    {:else if tab === 'workflows'}
      <!-- Workflow Panel -->
      <div class="sp-workflow-wrap">
        <WorkflowPanel />
      </div>
    {/if}
  </div>

  <!-- Bottom Toolbar -->
  <footer class="sp-footer">
    <button class="sp-btn sp-btn-primary" onclick={addCurrentPage} disabled={loading}>
      {#if loading}
        <span class="sp-btn-spinner"></span>
      {/if}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="7" y1="2" x2="7" y2="12"/>
        <line x1="2" y1="7" x2="12" y2="7"/>
      </svg>
      Add Page
    </button>
    <button class="sp-btn" onclick={exportKnowledge}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 2v7M4 6.5l3 3 3-3M2 11v1h10v-1"/>
      </svg>
      Export
    </button>
  </footer>
</div>

<style>
  /* ═══ Layout ═══ */
  .sp {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--cp-font-sans, 'Inter', sans-serif);
    background: var(--cp-slate-50, #f8fafc);
    color: var(--cp-slate-800, #1e293b);
    overflow: hidden;
  }

  /* ═══ Header ═══ */
  .sp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    flex-shrink: 0;
  }

  .sp-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sp-logo {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(20, 184, 166, 0.1), rgba(15, 118, 110, 0.08));
    border-radius: 8px;
  }

  .sp-brand-name {
    font-weight: 700;
    font-size: 14px;
    letter-spacing: -0.3px;
  }

  .sp-stats-mini {
    display: flex;
    gap: 6px;
  }

  .sp-stat-chip {
    font-size: 10px;
    font-weight: 500;
    color: var(--cp-slate-500, #64748b);
    background: var(--cp-slate-100, #f1f5f9);
    padding: 2px 8px;
    border-radius: 10px;
  }

  /* ═══ Tabs ═══ */
  .sp-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 16px 0;
    background: white;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    flex-shrink: 0;
  }

  .sp-tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 14px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--cp-slate-400, #94a3b8);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 150ms;
    font-family: inherit;
  }
  .sp-tab:hover { color: var(--cp-slate-600, #475569); }
  .sp-tab.active {
    color: var(--cp-teal-600, #0d9488);
    border-bottom-color: var(--cp-teal-500, #14b8a6);
  }

  /* ═══ Search ═══ */
  .sp-search {
    padding: 10px 16px;
    background: white;
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
    flex-shrink: 0;
  }

  .sp-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .sp-search-ico {
    position: absolute;
    left: 10px;
    color: var(--cp-slate-400, #94a3b8);
    pointer-events: none;
  }

  .sp-search-input {
    width: 100%;
    padding: 8px 32px 8px 34px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 10px;
    font-size: 13px;
    outline: none;
    background: var(--cp-slate-50, #f8fafc);
    transition: all 150ms;
    box-sizing: border-box;
    font-family: inherit;
  }
  .sp-search-input:focus {
    border-color: var(--cp-teal-400, #2dd4bf);
    background: white;
    box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.08);
  }

  .sp-search-clear {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: var(--cp-slate-200, #e2e8f0);
    border-radius: 50%;
    cursor: pointer;
    color: var(--cp-slate-500, #64748b);
    transition: all 150ms;
  }
  .sp-search-clear:hover { background: var(--cp-slate-300, #cbd5e1); }

  .sp-spinner {
    position: absolute;
    right: 10px;
    width: 14px;
    height: 14px;
    border: 2px solid var(--cp-slate-200, #e2e8f0);
    border-top-color: var(--cp-teal-500, #14b8a6);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* ═══ Main Content ═══ */
  .sp-main {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ═══ Split View ═══ */
  .sp-split {
    display: flex;
    height: 100%;
  }

  /* Left Panel */
  .sp-left {
    width: 260px;
    min-width: 220px;
    border-right: 1px solid var(--cp-slate-200, #e2e8f0);
    display: flex;
    flex-direction: column;
    background: white;
  }

  .sp-list-info {
    padding: 6px 12px;
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
    font-weight: 500;
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
    flex-shrink: 0;
  }

  .sp-nodes {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .sp-empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--cp-slate-400, #94a3b8);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .sp-empty p { margin: 0; }
  .sp-empty-sub { font-size: 11px; color: var(--cp-slate-300, #cbd5e1); }

  .sp-node {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 1px solid var(--cp-slate-50, #f8fafc);
    transition: background 150ms;
    font-family: inherit;
    color: inherit;
  }
  .sp-node:hover { background: var(--cp-slate-50, #f8fafc); }
  .sp-node.selected {
    background: var(--cp-teal-50, #f0fdfa);
    border-left: 3px solid var(--cp-teal-500, #14b8a6);
    padding-left: 9px;
  }

  .sp-node-title {
    font-weight: 600;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-node-summary {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin: 3px 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .sp-node-tags {
    display: flex;
    gap: 3px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .sp-tag {
    font-size: 10px;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-600, #475569);
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
  }
  .sp-tag-more { color: var(--cp-slate-400, #94a3b8); }

  .sp-node-date {
    font-size: 10px;
    color: var(--cp-slate-400, #94a3b8);
    margin-top: 3px;
    display: block;
  }

  /* Right Panel */
  .sp-right {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    background: var(--cp-slate-50, #f8fafc);
  }

  /* Detail */
  .sp-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .sp-detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    background: white;
    flex-shrink: 0;
  }

  .sp-detail-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cp-teal-600, #0d9488);
    font-size: 13px;
    font-weight: 500;
    padding: 4px 0;
    font-family: inherit;
  }
  .sp-detail-back:hover { color: var(--cp-teal-700, #0f766e); }

  .sp-detail-del {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 6px;
    background: white;
    cursor: pointer;
    color: var(--cp-slate-400, #94a3b8);
    transition: all 150ms;
  }
  .sp-detail-del:hover {
    color: var(--cp-danger, #ef4444);
    border-color: var(--cp-danger, #ef4444);
    background: #fef2f2;
  }

  .sp-detail-body {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
  }

  .sp-detail-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--cp-slate-900, #0f172a);
    line-height: 1.3;
  }

  .sp-detail-url {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--cp-teal-600, #0d9488);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    margin-bottom: 10px;
  }
  .sp-detail-url:hover { text-decoration: underline; }

  .sp-detail-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--cp-slate-400, #94a3b8);
    margin-bottom: 12px;
  }

  .sp-detail-tags {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .sp-detail-sections { margin-top: 8px; }

  .sp-section h3 {
    font-size: 12px;
    font-weight: 600;
    color: var(--cp-slate-500, #64748b);
    margin: 16px 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .sp-section h3:first-child { margin-top: 0; }

  .sp-section p {
    font-size: 13px;
    line-height: 1.7;
    color: var(--cp-slate-600, #475569);
    margin: 0;
  }

  .sp-content-text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Detail Placeholder */
  .sp-detail-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--cp-slate-400, #94a3b8);
    gap: 12px;
    font-size: 13px;
  }

  /* ═══ Graph View ═══ */
  .sp-graph-wrap {
    height: 100%;
    padding: 0;
  }

  /* ═══ Workflow View ═══ */
  .sp-workflow-wrap {
    height: 100%;
    overflow-y: auto;
  }

  /* ═══ Footer ═══ */
  .sp-footer {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    background: white;
    border-top: 1px solid var(--cp-slate-200, #e2e8f0);
    flex-shrink: 0;
  }

  .sp-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 10px;
    background: white;
    color: var(--cp-slate-600, #475569);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms;
    font-family: inherit;
  }
  .sp-btn:hover {
    background: var(--cp-slate-50, #f8fafc);
    border-color: var(--cp-slate-300, #cbd5e1);
  }

  .sp-btn-primary {
    background: linear-gradient(135deg, var(--cp-teal-500, #14b8a6), var(--cp-teal-600, #0d9488));
    color: white;
    border-color: transparent;
    box-shadow: 0 2px 6px rgba(13, 148, 136, 0.2);
  }
  .sp-btn-primary:hover {
    background: linear-gradient(135deg, var(--cp-teal-600, #0d9488), var(--cp-teal-700, #0f766e));
    border-color: transparent;
    box-shadow: 0 3px 10px rgba(13, 148, 136, 0.3);
  }
  .sp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .sp-btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* ═══ Toast ═══ */
  .toast {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 12.5px;
    font-weight: 500;
    z-index: 100;
    animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    white-space: nowrap;
  }
  .toast-s { background: var(--cp-success, #10b981); color: white; }
  .toast-e { background: var(--cp-danger, #ef4444); color: white; }

  @keyframes slideDown {
    from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
