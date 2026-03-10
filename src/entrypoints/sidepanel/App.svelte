<script lang="ts">
  import { onMount } from 'svelte';

  // ── Types ──
  interface KnowledgeNode {
    id: string;
    title: string;
    summary: string;
    content: string;
    url: string;
    tags: string[];
    timestamp: string;
    relations?: { targetId: string; type: string }[];
  }

  // ── State ──
  let nodes = $state<KnowledgeNode[]>([]);
  let selectedNode = $state<KnowledgeNode | null>(null);
  let searchQuery = $state('');
  let searchResults = $state<KnowledgeNode[]>([]);
  let view = $state<'list' | 'graph'>('list');
  let loading = $state(false);
  let notification = $state<{ text: string; type: string } | null>(null);

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

  async function addCurrentPage() {
    loading = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
        showNotification('Cannot capture this page', 'error');
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/capture.js'],
      });
      await new Promise((r) => setTimeout(r, 300));
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'captureContext',
        options: { captureDepth: 'standard' },
      });
      if (response?.success) {
        await sendMessage('saveContext', response.context);
        showNotification('Page added to knowledge base');
        await loadNodes();
      } else {
        showNotification('Capture failed', 'error');
      }
    } catch {
      showNotification('Failed to add page', 'error');
    } finally {
      loading = false;
    }
  }

  async function exportKnowledge() {
    try {
      const data = await sendMessage('exportKnowledge');
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
    nodes = (await sendMessage('getAllContexts')) || [];
  }

  onMount(async () => {
    await loadNodes();
  });
</script>

<div class="sidepanel-container">
  <!-- Notification Toast -->
  {#if notification}
    <div class="toast toast-{notification.type}">{notification.text}</div>
  {/if}

  <!-- Header -->
  <header class="sp-header">
    <div class="sp-header-left">
      <img src="/assets/icons/icon-48.png" alt="Logo" class="sp-logo" />
      <span class="sp-title">ContextPrompt AI</span>
      <span class="sp-version">v4</span>
    </div>
    <div class="sp-view-toggle">
      <button
        class="sp-toggle-btn"
        class:active={view === 'list'}
        onclick={() => (view = 'list')}
        title="List View"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="2" width="14" height="2" rx="0.5" />
          <rect x="1" y="7" width="14" height="2" rx="0.5" />
          <rect x="1" y="12" width="14" height="2" rx="0.5" />
        </svg>
      </button>
      <button
        class="sp-toggle-btn"
        class:active={view === 'graph'}
        onclick={() => (view = 'graph')}
        title="Graph View"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="4" cy="4" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="8" cy="12" r="2" />
          <line x1="4" y1="4" x2="12" y2="4" stroke="currentColor" stroke-width="1" />
          <line x1="4" y1="4" x2="8" y2="12" stroke="currentColor" stroke-width="1" />
          <line x1="12" y1="4" x2="8" y2="12" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
    </div>
  </header>

  <!-- Search Bar -->
  <div class="sp-search-bar">
    <div class="sp-search-wrapper">
      <svg class="sp-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="7" cy="7" r="5" />
        <line x1="11" y1="11" x2="14" y2="14" />
      </svg>
      <input
        type="text"
        class="sp-search-input"
        placeholder="Search knowledge base..."
        bind:value={searchQuery}
        oninput={handleSearchInput}
      />
      {#if loading}
        <span class="sp-search-spinner"></span>
      {/if}
    </div>
  </div>

  <!-- Main Content -->
  <div class="sp-main">
    <!-- Left Panel: Node List -->
    <div class="sp-left-panel">
      <div class="sp-list-header">
        <span class="sp-list-count">{displayedNodes.length} {displayedNodes.length === 1 ? 'node' : 'nodes'}</span>
        {#if searchQuery.trim()}
          <button class="sp-clear-search" onclick={() => { searchQuery = ''; searchResults = []; }}>
            Clear search
          </button>
        {/if}
      </div>

      <div class="sp-node-list">
        {#if displayedNodes.length === 0}
          <div class="sp-empty">
            {#if searchQuery.trim()}
              <p>No results for "{searchQuery}"</p>
            {:else}
              <p>No knowledge nodes yet.</p>
              <p class="sp-empty-hint">Add pages to build your knowledge base.</p>
            {/if}
          </div>
        {:else}
          {#each displayedNodes as node}
            <button
              class="sp-node-card"
              class:selected={selectedNode?.id === node.id}
              onclick={() => selectNode(node)}
            >
              <div class="sp-node-title">{node.title || 'Untitled'}</div>
              <p class="sp-node-summary">{node.aiSummary || node.summary || node.description || ''}</p>
              {#if node.tags?.length > 0}
                <div class="sp-node-tags">
                  {#each node.tags.slice(0, 4) as tag}
                    <span class="sp-tag">{tag}</span>
                  {/each}
                  {#if node.tags.length > 4}
                    <span class="sp-tag sp-tag-more">+{node.tags.length - 4}</span>
                  {/if}
                </div>
              {/if}
              <span class="sp-node-date">{formatDate(node.timestamp)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right Panel: Detail / Graph -->
    <div class="sp-right-panel">
      {#if view === 'graph'}
        <div class="sp-graph-view">
          <div id="graph-container" class="sp-graph-container">
            <div class="sp-graph-placeholder">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--cp-slate-300)" stroke-width="1.5">
                <circle cx="12" cy="12" r="4" />
                <circle cx="36" cy="12" r="4" />
                <circle cx="24" cy="36" r="4" />
                <circle cx="36" cy="32" r="3" />
                <line x1="12" y1="12" x2="36" y2="12" />
                <line x1="12" y1="12" x2="24" y2="36" />
                <line x1="36" y1="12" x2="24" y2="36" />
                <line x1="36" y1="12" x2="36" y2="32" />
              </svg>
              <p>Knowledge Graph Visualization</p>
              <p class="sp-graph-hint">Graph rendering will be initialized here.</p>
            </div>
          </div>
        </div>
      {:else if selectedNode}
        <div class="sp-detail-view">
          <div class="sp-detail-header">
            <button class="sp-back-btn" onclick={clearSelection}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.5 2.5L5 8l5.5 5.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Back
            </button>
          </div>
          <div class="sp-detail-content">
            <h2 class="sp-detail-title">{selectedNode.title}</h2>
            {#if selectedNode.url}
              <a href={selectedNode.url} target="_blank" rel="noopener" class="sp-detail-url">
                {selectedNode.url}
              </a>
            {/if}
            <div class="sp-detail-meta">
              <span class="sp-detail-date">{formatDate(selectedNode.timestamp)}</span>
            </div>
            {#if selectedNode.tags?.length > 0}
              <div class="sp-detail-tags">
                {#each selectedNode.tags as tag}
                  <span class="sp-tag">{tag}</span>
                {/each}
              </div>
            {/if}
            <div class="sp-detail-body">
              <h3>Summary</h3>
              <p>{selectedNode.aiSummary || selectedNode.summary || selectedNode.description || 'No summary available.'}</p>
              {#if selectedNode.content}
                <h3>Content</h3>
                <p class="sp-detail-full-content">{selectedNode.content}</p>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="sp-detail-empty">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--cp-slate-300)" stroke-width="1.5">
            <rect x="8" y="6" width="32" height="36" rx="3" />
            <line x1="14" y1="14" x2="34" y2="14" />
            <line x1="14" y1="20" x2="34" y2="20" />
            <line x1="14" y1="26" x2="28" y2="26" />
          </svg>
          <p>Select a node to view details</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Bottom Toolbar -->
  <footer class="sp-toolbar">
    <button class="sp-toolbar-btn sp-btn-primary" onclick={addCurrentPage} disabled={loading}>
      {#if loading}
        <span class="sp-btn-spinner"></span>
      {/if}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>
      Add Current Page
    </button>
    <button class="sp-toolbar-btn" onclick={exportKnowledge}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v8M4 7l4 4 4-4M2 12v2h12v-2" />
      </svg>
      Export
    </button>
  </footer>
</div>

<style>
  /* ── Layout ── */
  .sidepanel-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--cp-font-sans, 'Inter', sans-serif);
    background: var(--cp-slate-50, #f8fafc);
    color: var(--cp-slate-800, #1e293b);
    overflow: hidden;
  }

  /* ── Header ── */
  .sp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: white;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    flex-shrink: 0;
  }

  .sp-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sp-logo { width: 24px; height: 24px; }
  .sp-title { font-weight: 600; font-size: 15px; }
  .sp-version {
    font-size: 10px;
    background: var(--cp-teal-100, #ccfbf1);
    color: var(--cp-teal-700, #0f766e);
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
  }

  .sp-view-toggle {
    display: flex;
    gap: 2px;
    background: var(--cp-slate-100, #f1f5f9);
    border-radius: 8px;
    padding: 2px;
  }

  .sp-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    border: none;
    background: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--cp-slate-400, #94a3b8);
    transition: all var(--duration-fast, 150ms);
  }
  .sp-toggle-btn:hover { color: var(--cp-slate-600, #475569); }
  .sp-toggle-btn.active {
    background: white;
    color: var(--cp-teal-600, #0d9488);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
  }

  /* ── Search Bar ── */
  .sp-search-bar {
    padding: 10px 16px;
    background: white;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    flex-shrink: 0;
  }

  .sp-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .sp-search-icon {
    position: absolute;
    left: 10px;
    color: var(--cp-slate-400, #94a3b8);
    pointer-events: none;
  }

  .sp-search-input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    font-size: 13px;
    outline: none;
    background: var(--cp-slate-50, #f8fafc);
    transition: border-color var(--duration-fast, 150ms);
    box-sizing: border-box;
  }
  .sp-search-input:focus {
    border-color: var(--cp-teal-400, #2dd4bf);
    background: white;
  }

  .sp-search-spinner {
    position: absolute;
    right: 10px;
    width: 14px;
    height: 14px;
    border: 2px solid var(--cp-slate-200, #e2e8f0);
    border-top-color: var(--cp-teal-500, #14b8a6);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* ── Main Content ── */
  .sp-main {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Left Panel ── */
  .sp-left-panel {
    width: 280px;
    min-width: 240px;
    border-right: 1px solid var(--cp-slate-200, #e2e8f0);
    display: flex;
    flex-direction: column;
    background: white;
  }

  .sp-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
    flex-shrink: 0;
  }

  .sp-list-count { font-weight: 500; }

  .sp-clear-search {
    background: none;
    border: none;
    color: var(--cp-teal-600, #0d9488);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    font-weight: 500;
  }
  .sp-clear-search:hover { text-decoration: underline; }

  .sp-node-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .sp-empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--cp-slate-400, #94a3b8);
    font-size: 13px;
  }
  .sp-empty-hint { font-size: 12px; margin-top: 4px; }

  .sp-node-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
    transition: background var(--duration-fast, 150ms);
    font-family: inherit;
    color: inherit;
  }
  .sp-node-card:hover { background: var(--cp-slate-50, #f8fafc); }
  .sp-node-card.selected {
    background: var(--cp-teal-50, #f0fdfa);
    border-left: 3px solid var(--cp-teal-500, #14b8a6);
  }

  .sp-node-title {
    font-weight: 600;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cp-slate-800, #1e293b);
  }

  .sp-node-summary {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin: 4px 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .sp-node-tags {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .sp-tag {
    font-size: 10px;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-600, #475569);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .sp-tag-more {
    color: var(--cp-slate-400, #94a3b8);
  }

  .sp-node-date {
    font-size: 10px;
    color: var(--cp-slate-400, #94a3b8);
    margin-top: 4px;
    display: block;
  }

  /* ── Right Panel ── */
  .sp-right-panel {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    background: var(--cp-slate-50, #f8fafc);
  }

  /* Detail View */
  .sp-detail-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .sp-detail-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    background: white;
    flex-shrink: 0;
  }

  .sp-back-btn {
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
  .sp-back-btn:hover { color: var(--cp-teal-700, #0f766e); }

  .sp-detail-content {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
  }

  .sp-detail-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--cp-slate-900, #0f172a);
    line-height: 1.3;
  }

  .sp-detail-url {
    display: block;
    font-size: 12px;
    color: var(--cp-teal-600, #0d9488);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 12px;
  }
  .sp-detail-url:hover { text-decoration: underline; }

  .sp-detail-meta {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }

  .sp-detail-date {
    font-size: 12px;
    color: var(--cp-slate-400, #94a3b8);
  }

  .sp-detail-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .sp-detail-body h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--cp-slate-700, #334155);
    margin: 16px 0 8px;
  }
  .sp-detail-body h3:first-child { margin-top: 0; }

  .sp-detail-body p {
    font-size: 13px;
    line-height: 1.7;
    color: var(--cp-slate-600, #475569);
    margin: 0;
  }

  .sp-detail-full-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Empty Detail */
  .sp-detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--cp-slate-400, #94a3b8);
    gap: 12px;
    font-size: 14px;
  }

  /* ── Graph View ── */
  .sp-graph-view {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .sp-graph-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .sp-graph-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--cp-slate-400, #94a3b8);
    font-size: 14px;
  }

  .sp-graph-hint {
    font-size: 12px;
    margin: 0;
    color: var(--cp-slate-300, #cbd5e1);
  }

  /* ── Bottom Toolbar ── */
  .sp-toolbar {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    background: white;
    border-top: 1px solid var(--cp-slate-200, #e2e8f0);
    flex-shrink: 0;
  }

  .sp-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: var(--radius-md, 10px);
    background: white;
    color: var(--cp-slate-600, #475569);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms);
    font-family: inherit;
  }
  .sp-toolbar-btn:hover {
    background: var(--cp-slate-50, #f8fafc);
    border-color: var(--cp-slate-300, #cbd5e1);
  }

  .sp-btn-primary {
    background: linear-gradient(135deg, var(--cp-teal-500, #14b8a6), var(--cp-teal-600, #0d9488));
    color: white;
    border-color: transparent;
  }
  .sp-btn-primary:hover {
    background: linear-gradient(135deg, var(--cp-teal-600, #0d9488), var(--cp-teal-700, #0f766e));
    border-color: transparent;
  }
  .sp-btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sp-btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* ── Toast ── */
  .toast {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 100;
    animation: slideDown 0.3s ease;
  }
  .toast-success { background: var(--cp-success, #10b981); color: white; }
  .toast-error { background: var(--cp-danger, #ef4444); color: white; }

  @keyframes slideDown { from { transform: translateX(-50%) translateY(-20px); opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
