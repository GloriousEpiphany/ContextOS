<script lang="ts">
  import { onMount } from 'svelte';

  // ── State ──
  let view = $state<'main' | 'settings' | 'history'>('main');
  let contexts = $state<any[]>([]);
  let searchQuery = $state('');
  let templates = $state<any[]>([]);
  let selectedTemplate = $state('standard');
  let settings = $state<any>({});
  let history = $state<any[]>([]);
  let loading = $state(false);
  let notification = $state<{ text: string; type: string } | null>(null);
  let stats = $state<{ nodes: number; relations: number; tags: number }>({ nodes: 0, relations: 0, tags: 0 });
  let aiStatus = $state<{ enabled: boolean; engine: string }>({ enabled: false, engine: 'Off' });
  let summarizingId = $state<string | null>(null);

  // ── Computed ──
  let filteredContexts = $derived(
    searchQuery
      ? contexts.filter(
          (c) =>
            c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.tags?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : contexts
  );

  // ── Messaging ──
  function sendMessage(action: string, data?: any): Promise<any> {
    return chrome.runtime.sendMessage({ action, data });
  }

  function showNotification(text: string, type = 'success') {
    notification = { text, type };
    setTimeout(() => (notification = null), 3000);
  }

  function formatTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return chrome.i18n.getMessage('justNow') || 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── Actions ──
  async function captureCurrentPage() {
    loading = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
        showNotification(chrome.i18n.getMessage('cannotCapture') || 'Cannot capture this page', 'error');
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/capture.js'],
      });
      await new Promise((r) => setTimeout(r, 300));
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'captureContext',
        options: { captureDepth: settings.captureDepth || 'standard' },
      });
      if (response?.success) {
        await sendMessage('saveContext', response.context);
        showNotification(chrome.i18n.getMessage('contextCaptured') || 'Page captured successfully!');
        await loadContexts();
        await loadStats();
      } else {
        showNotification(chrome.i18n.getMessage('captureFailed') || 'Capture failed', 'error');
      }
    } catch {
      showNotification(chrome.i18n.getMessage('captureFailed') || 'Capture failed', 'error');
    } finally {
      loading = false;
    }
  }

  async function captureBatchTabs() {
    loading = true;
    try {
      const result = await sendMessage('captureBatchTabs');
      const count = result?.results?.filter((r: any) => r.success).length || 0;
      if (count > 0) {
        showNotification(`Captured ${count} pages`);
        await loadContexts();
        await loadStats();
      } else {
        showNotification('No pages captured', 'error');
      }
    } catch {
      showNotification('Batch capture failed', 'error');
    } finally {
      loading = false;
    }
  }

  async function deleteContext(id: string) {
    await sendMessage('deleteContext', { id });
    showNotification(chrome.i18n.getMessage('deleted') || 'Deleted');
    await loadContexts();
  }

  async function clearAll() {
    if (!confirm('Clear all contexts?')) return;
    await sendMessage('clearAllContexts');
    showNotification(chrome.i18n.getMessage('allCleared') || 'All cleared');
    await loadContexts();
  }

  async function openSidePanel() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch {
      // Fallback to message-based approach
      await sendMessage('openSidePanel');
    }
  }

  async function saveSettingsAction() {
    await sendMessage('saveSettings', settings);
    showNotification('Settings saved');
  }

  async function testConnection() {
    const result = await sendMessage('testAIConnection');
    showNotification(
      result.success
        ? chrome.i18n.getMessage('connectionSuccess') || 'Connection successful!'
        : (chrome.i18n.getMessage('connectionFailed') || 'Connection failed') + ': ' + result.message,
      result.success ? 'success' : 'error'
    );
  }

  // ── Data Loading ──
  async function loadContexts() {
    contexts = (await sendMessage('getAllContexts')) || [];
  }

  async function loadTemplates() {
    templates = (await sendMessage('getTemplates')) || [];
  }

  async function loadSettings() {
    settings = (await sendMessage('getSettings')) || {};
    // Compute AI status from settings
    if (settings.aiEnabled) {
      aiStatus = { enabled: true, engine: 'Cloud' };
    } else if (settings.localAiEnabled) {
      aiStatus = { enabled: true, engine: 'Local' };
    } else {
      aiStatus = { enabled: false, engine: 'Off' };
    }
  }

  async function summarizeCard(id: string) {
    summarizingId = id;
    try {
      const result = await sendMessage('summarizeContext', { id });
      if (result?.success && result.summary) {
        // Update the context in local state
        const idx = contexts.findIndex((c) => c.id === id);
        if (idx !== -1) {
          contexts[idx] = { ...contexts[idx], aiSummary: result.summary };
          contexts = [...contexts]; // trigger reactivity
        }
        showNotification('AI summary generated');
      } else {
        showNotification(result?.error || 'Summarize failed', 'error');
      }
    } catch {
      showNotification('Summarize failed', 'error');
    } finally {
      summarizingId = null;
    }
  }

  async function loadHistory() {
    history = (await sendMessage('getPromptHistory')) || [];
  }

  async function loadStats() {
    try {
      const result = await sendMessage('getKnowledgeStats');
      if (result) {
        const data = result?.stats || result;
        stats = {
          nodes: data?.nodeCount || data?.totalNodes || 0,
          relations: data?.relationCount || data?.totalRelations || 0,
          tags: data?.embeddingCount || data?.uniqueTags || 0,
        };
      }
    } catch { /* ignore */ }
  }

  onMount(async () => {
    await Promise.all([loadContexts(), loadTemplates(), loadSettings(), loadStats()]);
  });
</script>

<div class="popup">
  <!-- Notification Toast -->
  {#if notification}
    <div class="toast" class:toast-success={notification.type === 'success'} class:toast-error={notification.type === 'error'}>
      <svg class="toast-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
        {#if notification.type === 'success'}
          <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
          <path d="M4.5 7L6.5 9L9.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        {:else}
          <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 4.5V7.5M7 9.5V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        {/if}
      </svg>
      {notification.text}
    </div>
  {/if}

  <!-- Header -->
  <header class="header">
    {#if view === 'main'}
      <div class="header-left">
        <div class="logo-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#g1)" opacity="0.9"/>
            <path d="M2 17l10 5 10-5" stroke="url(#g1)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12l10 5 10-5" stroke="url(#g1)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="g1" x1="2" y1="2" x2="22" y2="22">
                <stop stop-color="#14b8a6"/>
                <stop offset="1" stop-color="#0f766e"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="header-title-group">
          <span class="title">ContextPrompt AI</span>
          <span class="badge">v4</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" title="Knowledge Panel" onclick={openSidePanel}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2"/>
            <line x1="6" y1="2" x2="6" y2="14"/>
          </svg>
        </button>
        <button class="icon-btn" title="History" onclick={() => { view = 'history'; loadHistory(); }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <polyline points="8,4.5 8,8 10.5,9.5"/>
          </svg>
        </button>
        <button class="icon-btn" title="Settings" onclick={() => (view = 'settings')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="2"/>
            <path d="M13.5 8a5.5 5.5 0 01-.3 1.8l1.3 1-1.2 2-1.5-.6a5.5 5.5 0 01-1.6.9L10 14.6H7.8l-.2-1.5a5.5 5.5 0 01-1.6-.9l-1.5.6-1.2-2 1.3-1A5.5 5.5 0 014.3 8c0-.6.1-1.2.3-1.8l-1.3-1 1.2-2 1.5.6a5.5 5.5 0 011.6-.9L7.8 1.4H10l.2 1.5a5.5 5.5 0 011.6.9l1.5-.6 1.2 2-1.3 1c.2.6.3 1.2.3 1.8z"/>
          </svg>
        </button>
      </div>
    {:else}
      <button class="back-btn" onclick={() => (view = 'main')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 2L4 7l5 5"/>
        </svg>
        {chrome.i18n.getMessage('back') || 'Back'}
      </button>
      <span class="header-section-title">
        {view === 'settings' ? (chrome.i18n.getMessage('settings') || 'Settings') : 'History'}
      </span>
      <div style="width: 60px;"></div>
    {/if}
  </header>

  <!-- Main View -->
  {#if view === 'main'}
    <!-- Hero Capture Section -->
    <div class="hero-section">
      <button class="capture-btn" onclick={captureCurrentPage} disabled={loading}>
        {#if loading}
          <span class="spinner"></span>
        {:else}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="9" r="7"/>
            <circle cx="9" cy="9" r="3"/>
            <circle cx="9" cy="9" r="0.5" fill="currentColor"/>
          </svg>
        {/if}
        <span>{chrome.i18n.getMessage('capture') || 'Capture This Page'}</span>
        <kbd>Ctrl+Shift+C</kbd>
      </button>
      <button class="batch-btn" onclick={captureBatchTabs} disabled={loading} title="Capture all open tabs">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="8" height="8" rx="1.5"/>
          <path d="M5 3V2a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1"/>
        </svg>
      </button>
    </div>

    <!-- Stats Strip -->
    <div class="stats-strip">
      <div class="stat-item">
        <span class="stat-value">{stats.nodes}</span>
        <span class="stat-label">Nodes</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{stats.relations}</span>
        <span class="stat-label">Relations</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{stats.tags}</span>
        <span class="stat-label">Tags</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{contexts.length}</span>
        <span class="stat-label">Contexts</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value" class:ai-on={aiStatus.enabled} class:ai-off={!aiStatus.enabled}>
          {aiStatus.engine}
        </span>
        <span class="stat-label">AI</span>
      </div>
    </div>

    <!-- Search & Filter Bar -->
    <div class="filter-bar">
      <div class="search-wrapper">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4">
          <circle cx="6" cy="6" r="4.5"/>
          <line x1="9.5" y1="9.5" x2="12.5" y2="12.5"/>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Search contexts..."
          bind:value={searchQuery}
        />
      </div>
      <div class="filter-actions">
        <select bind:value={selectedTemplate} class="template-select">
          {#each templates as t}
            <option value={t.id}>{t.name}</option>
          {/each}
        </select>
        <button class="icon-btn-sm" title="Clear All" onclick={clearAll}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Context List -->
    <div class="context-list">
      {#if filteredContexts.length === 0}
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="6" y="4" width="28" height="32" rx="4" stroke="var(--cp-slate-300)" stroke-width="1.5"/>
            <circle cx="20" cy="18" r="5" stroke="var(--cp-teal-400)" stroke-width="1.5" stroke-dasharray="3 2"/>
            <line x1="12" y1="28" x2="28" y2="28" stroke="var(--cp-slate-200)" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="14" y1="32" x2="26" y2="32" stroke="var(--cp-slate-200)" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p class="empty-title">{chrome.i18n.getMessage('emptyTitle') || 'No captured contexts'}</p>
          <p class="empty-hint">{chrome.i18n.getMessage('emptyHint') || 'Visit any page and click Capture to get started'}</p>
        </div>
      {:else}
        {#each filteredContexts as ctx}
          <div class="context-card">
            <div class="card-header">
              <div class="card-title-row">
                <span class="card-title" title={ctx.title}>{ctx.title}</span>
                <button class="card-delete" onclick={() => deleteContext(ctx.id)} title="Delete">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                    <line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/>
                    <line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/>
                  </svg>
                </button>
              </div>
              <div class="card-meta">
                <span class="card-time">{formatTime(ctx.timestamp)}</span>
                {#if ctx.platformName}
                  <span class="card-platform">{ctx.platformName}</span>
                {/if}
              </div>
            </div>
            {#if ctx.tags?.length > 0}
              <div class="card-tags">
                {#each ctx.tags.slice(0, 5) as tag}
                  <span class="tag">{tag}</span>
                {/each}
                {#if ctx.tags.length > 5}
                  <span class="tag tag-more">+{ctx.tags.length - 5}</span>
                {/if}
              </div>
            {/if}
            <p class="card-desc">{ctx.aiSummary || ctx.description || ctx.selection || '—'}</p>
            <div class="card-actions">
              {#if ctx.aiSummary}
                <span class="ai-badge">AI</span>
              {/if}
              <button
                class="card-ai-btn"
                onclick={(e: MouseEvent) => { e.stopPropagation(); summarizeCard(ctx.id); }}
                disabled={summarizingId === ctx.id}
                title={ctx.aiSummary ? 'Re-generate AI Summary' : 'Generate AI Summary'}
              >
                {#if summarizingId === ctx.id}
                  <span class="mini-spinner"></span>
                {:else}
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41"/>
                    <circle cx="7" cy="7" r="3"/>
                  </svg>
                {/if}
                AI Summary
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

  <!-- Settings View -->
  {:else if view === 'settings'}
    <div class="settings">
      <!-- Capture Settings -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <circle cx="8" cy="8" r="2.5"/>
          </svg>
          <h3>Capture</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{chrome.i18n.getMessage('enableInjection') || 'Button Injection'}</span>
            <span class="setting-desc">Inject capture button into pages</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.enableInjection} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{chrome.i18n.getMessage('captureDepth') || 'Capture Depth'}</span>
          </div>
          <select class="setting-select" bind:value={settings.captureDepth} onchange={saveSettingsAction}>
            <option value="light">Light</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Auto Capture</span>
            <span class="setting-desc">Capture on URL pattern match</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.autoCapture} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </section>

      <!-- AI Settings -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-indigo-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
            <circle cx="8" cy="8" r="3"/>
          </svg>
          <h3>{chrome.i18n.getMessage('aiIntegration') || 'AI Integration'}</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{chrome.i18n.getMessage('enableAI') || 'Enable AI'}</span>
            <span class="setting-desc">Cloud AI for summaries & analysis</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.aiEnabled} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>

        {#if settings.aiEnabled}
          <div class="ai-config">
            <label class="field">
              <span class="field-label">{chrome.i18n.getMessage('apiProvider') || 'Provider'}</span>
              <select class="field-input" bind:value={settings.aiProvider} onchange={saveSettingsAction}>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="anthropic">Anthropic</option>
                <option value="qwen">Qwen</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">{chrome.i18n.getMessage('apiKey') || 'API Key'}</span>
              <input class="field-input" type="password" bind:value={settings.aiApiKey} onchange={saveSettingsAction} placeholder="sk-..." />
            </label>
            {#if settings.aiProvider === 'custom'}
              <label class="field">
                <span class="field-label">Base URL</span>
                <input class="field-input" type="text" bind:value={settings.aiBaseUrl} onchange={saveSettingsAction} placeholder="https://..." />
              </label>
            {/if}
            <label class="field">
              <span class="field-label">{chrome.i18n.getMessage('model') || 'Model'}</span>
              <input class="field-input" type="text" bind:value={settings.aiModel} onchange={saveSettingsAction} placeholder="gpt-4o-mini" />
            </label>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Auto Summarize</span>
                <span class="setting-desc">Summarize on capture</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={settings.autoSummarize} onchange={saveSettingsAction} />
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </label>
            </div>
            <button class="test-btn" onclick={testConnection}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 7l3.5 3.5L12 3"/>
              </svg>
              {chrome.i18n.getMessage('testConnection') || 'Test Connection'}
            </button>
          </div>
        {/if}
      </section>

      <!-- MCP Settings -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8h8M8 4v8"/>
            <rect x="1.5" y="1.5" width="13" height="13" rx="3"/>
          </svg>
          <h3>MCP Server</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Enable MCP Server</span>
            <span class="setting-desc">Expose tools via localhost</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.mcpServerEnabled} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
        {#if settings.mcpServerEnabled}
          <label class="field" style="padding: 0 0 4px;">
            <span class="field-label">Port</span>
            <input class="field-input" type="number" bind:value={settings.mcpServerPort} onchange={saveSettingsAction} />
          </label>
        {/if}
      </section>

      <!-- Knowledge Graph Settings -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="4" cy="4" r="2"/>
            <circle cx="12" cy="4" r="2"/>
            <circle cx="8" cy="12" r="2"/>
            <line x1="5.5" y1="5.5" x2="6.5" y2="10.5"/>
            <line x1="10.5" y1="5.5" x2="9.5" y2="10.5"/>
            <line x1="6" y1="4" x2="10" y2="4"/>
          </svg>
          <h3>Knowledge Graph</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Enable Knowledge Graph</span>
            <span class="setting-desc">Build connections between nodes</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.knowledgeGraphEnabled} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Local AI (Gemini Nano)</span>
            <span class="setting-desc">Chrome built-in offline AI</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.localAiEnabled} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </section>

      <!-- Data Management -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-slate-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="8" cy="4" rx="5.5" ry="2.5"/>
            <path d="M2.5 4v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V4"/>
            <path d="M2.5 8v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V8"/>
          </svg>
          <h3>Data</h3>
        </div>
        <div class="data-actions">
          <button class="data-btn" onclick={async () => {
            const data = await sendMessage('exportData');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `contextprompt-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification('Data exported');
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 2v7M4 6.5l3 3 3-3M2 11v1h10v-1"/>
            </svg>
            Export
          </button>
          <button class="data-btn" onclick={async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              const text = await file.text();
              const data = JSON.parse(text);
              await sendMessage('importData', data);
              showNotification('Data imported');
              await loadContexts();
              await loadStats();
            };
            input.click();
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 9V2M4 4.5l3-3 3 3M2 11v1h10v-1"/>
            </svg>
            Import
          </button>
        </div>
      </section>
    </div>

  <!-- History View -->
  {:else if view === 'history'}
    <div class="history-list">
      {#if history.length === 0}
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="14" stroke="var(--cp-slate-300)" stroke-width="1.5"/>
            <polyline points="20,10 20,20 26,23" stroke="var(--cp-teal-400)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <p class="empty-title">No prompt history</p>
          <p class="empty-hint">Generated prompts will appear here</p>
        </div>
      {:else}
        {#each history as entry}
          <div class="history-card">
            <div class="history-header">
              <span class="history-title">{entry.contextTitle || 'Untitled'}</span>
              <span class="history-time">{formatTime(entry.timestamp)}</span>
            </div>
            <p class="history-prompt">{entry.prompt.substring(0, 200)}...</p>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ═══ Layout ═══ */
  .popup {
    width: 400px;
    min-height: 500px;
    max-height: 600px;
    overflow-y: auto;
    font-family: var(--cp-font-sans, 'Inter', sans-serif);
    background: var(--cp-slate-50, #f8fafc);
    color: var(--cp-slate-800, #1e293b);
    position: relative;
  }

  /* ═══ Header ═══ */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo-mark {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(20, 184, 166, 0.1) 0%, rgba(15, 118, 110, 0.08) 100%);
    border-radius: 10px;
  }

  .header-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .title { font-weight: 700; font-size: 15px; letter-spacing: -0.3px; }

  .badge {
    font-size: 9px;
    font-weight: 600;
    background: linear-gradient(135deg, var(--cp-teal-500, #14b8a6), var(--cp-teal-600, #0d9488));
    color: white;
    padding: 1px 7px;
    border-radius: 10px;
    letter-spacing: 0.3px;
  }

  .header-actions { display: flex; gap: 2px; }

  .header-section-title {
    font-weight: 600;
    font-size: 15px;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 7px;
    border-radius: 8px;
    color: var(--cp-slate-500, #64748b);
    transition: all 150ms;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover {
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-teal-600, #0d9488);
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--cp-teal-600, #0d9488);
    font-weight: 500;
    padding: 4px 0;
    font-family: inherit;
  }
  .back-btn:hover { color: var(--cp-teal-700, #0f766e); }

  /* ═══ Hero Capture ═══ */
  .hero-section {
    display: flex;
    gap: 8px;
    padding: 12px 14px 8px;
  }

  .capture-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex: 1;
    padding: 11px 16px;
    background: linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
    font-family: inherit;
    position: relative;
    overflow: hidden;
  }
  .capture-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%);
    pointer-events: none;
  }
  .capture-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(13, 148, 136, 0.35);
  }
  .capture-btn:active:not(:disabled) { transform: translateY(0); }
  .capture-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .capture-btn kbd {
    font-size: 9px;
    background: rgba(255, 255, 255, 0.18);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--cp-font-mono, monospace);
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .batch-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    background: white;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 12px;
    cursor: pointer;
    color: var(--cp-slate-500, #64748b);
    transition: all 150ms;
  }
  .batch-btn:hover {
    border-color: var(--cp-teal-300, #5eead4);
    color: var(--cp-teal-600, #0d9488);
    background: var(--cp-teal-50, #f0fdfa);
  }
  .batch-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* ═══ Stats Strip ═══ */
  .stats-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 8px 14px;
    margin: 0 14px 8px;
    background: white;
    border-radius: 10px;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
  }

  .stat-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--cp-slate-800, #1e293b);
    line-height: 1.2;
  }

  .stat-label {
    font-size: 10px;
    color: var(--cp-slate-400, #94a3b8);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-divider {
    width: 1px;
    height: 24px;
    background: var(--cp-slate-100, #f1f5f9);
  }

  /* ═══ Filter Bar ═══ */
  .filter-bar {
    padding: 0 14px 8px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .search-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    color: var(--cp-slate-400, #94a3b8);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 7px 10px 7px 32px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    font-size: 12.5px;
    outline: none;
    background: white;
    transition: border-color 150ms, box-shadow 150ms;
    font-family: inherit;
    box-sizing: border-box;
  }
  .search-input:focus {
    border-color: var(--cp-teal-400, #2dd4bf);
    box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.1);
  }

  .filter-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .template-select {
    padding: 6px 8px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    font-size: 12px;
    background: white;
    color: var(--cp-slate-600, #475569);
    cursor: pointer;
    font-family: inherit;
  }

  .icon-btn-sm {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background: none;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    cursor: pointer;
    color: var(--cp-slate-400, #94a3b8);
    transition: all 150ms;
  }
  .icon-btn-sm:hover {
    border-color: var(--cp-danger, #ef4444);
    color: var(--cp-danger, #ef4444);
    background: var(--cp-danger-light, #fee2e2);
  }

  /* ═══ Context List ═══ */
  .context-list { padding: 0 14px 14px; }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--cp-slate-500, #64748b);
    margin: 0;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--cp-slate-400, #94a3b8);
    margin: 0;
  }

  .context-card {
    background: white;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 8px;
    transition: all 200ms;
    cursor: default;
  }
  .context-card:hover {
    border-color: var(--cp-slate-200, #e2e8f0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .card-header { margin-bottom: 6px; }

  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .card-title {
    font-weight: 600;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    color: var(--cp-slate-800, #1e293b);
  }

  .card-delete {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cp-slate-300, #cbd5e1);
    padding: 2px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms;
    flex-shrink: 0;
  }
  .card-delete:hover {
    color: var(--cp-danger, #ef4444);
    background: var(--cp-danger-light, #fee2e2);
  }

  .card-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
    margin-top: 2px;
  }

  .card-platform {
    background: linear-gradient(135deg, var(--cp-teal-50, #f0fdfa), var(--cp-teal-100, #ccfbf1));
    color: var(--cp-teal-700, #0f766e);
    padding: 0 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
  }

  .card-tags {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 10px;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-600, #475569);
    padding: 1px 7px;
    border-radius: 4px;
    font-weight: 500;
  }

  .tag-more {
    color: var(--cp-slate-400, #94a3b8);
    background: transparent;
    padding-left: 2px;
  }

  .card-desc {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin: 0;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ═══ Settings ═══ */
  .settings {
    padding: 10px 14px 14px;
  }

  .settings-group {
    background: white;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
  }

  .settings-group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--cp-slate-100, #f1f5f9);
  }

  .settings-group-header h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    color: var(--cp-slate-800, #1e293b);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
  }

  .setting-info { display: flex; flex-direction: column; gap: 1px; }

  .setting-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--cp-slate-700, #334155);
  }

  .setting-desc {
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
  }

  .setting-select {
    padding: 5px 8px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 6px;
    font-size: 12px;
    background: white;
    color: var(--cp-slate-600, #475569);
    font-family: inherit;
  }

  /* Toggle Switch */
  .toggle {
    position: relative;
    display: inline-flex;
    cursor: pointer;
    flex-shrink: 0;
  }

  .toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    width: 36px;
    height: 20px;
    background: var(--cp-slate-200, #e2e8f0);
    border-radius: 10px;
    position: relative;
    transition: background 200ms;
  }

  .toggle input:checked + .toggle-track {
    background: linear-gradient(135deg, var(--cp-teal-500, #14b8a6), var(--cp-teal-600, #0d9488));
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  .toggle input:checked + .toggle-track .toggle-thumb {
    transform: translateX(16px);
  }

  /* AI Config */
  .ai-config {
    margin-top: 8px;
    padding: 12px;
    background: var(--cp-slate-50, #f8fafc);
    border-radius: 10px;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
  }

  .field {
    display: block;
    margin-bottom: 10px;
    cursor: default;
  }

  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--cp-slate-500, #64748b);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .field-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    font-size: 13px;
    outline: none;
    background: white;
    transition: border-color 150ms;
    font-family: inherit;
    box-sizing: border-box;
  }
  .field-input:focus {
    border-color: var(--cp-teal-400, #2dd4bf);
  }

  .test-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 7px 14px;
    background: white;
    border: 1px solid var(--cp-teal-300, #5eead4);
    color: var(--cp-teal-700, #0f766e);
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 150ms;
    font-family: inherit;
  }
  .test-btn:hover {
    background: var(--cp-teal-50, #f0fdfa);
    border-color: var(--cp-teal-400, #2dd4bf);
  }

  /* Data Actions */
  .data-actions {
    display: flex;
    gap: 8px;
  }

  .data-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    background: white;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--cp-slate-600, #475569);
    cursor: pointer;
    transition: all 150ms;
    font-family: inherit;
  }
  .data-btn:hover {
    border-color: var(--cp-slate-300, #cbd5e1);
    background: var(--cp-slate-50, #f8fafc);
  }

  /* ═══ History ═══ */
  .history-list { padding: 10px 14px; }

  .history-card {
    background: white;
    border: 1px solid var(--cp-slate-100, #f1f5f9);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    transition: border-color 150ms;
  }
  .history-card:hover { border-color: var(--cp-slate-200, #e2e8f0); }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .history-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--cp-slate-800, #1e293b);
  }

  .history-time {
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
  }

  .history-prompt {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin: 0;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ═══ Toast ═══ */
  .toast {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 12.5px;
    font-weight: 500;
    z-index: 100;
    animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    white-space: nowrap;
  }

  .toast-success {
    background: var(--cp-success, #10b981);
    color: white;
  }

  .toast-error {
    background: var(--cp-danger, #ef4444);
    color: white;
  }

  .toast-icon { flex-shrink: 0; }

  @keyframes slideDown {
    from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ═══ AI Status ═══ */
  .ai-on { color: var(--cp-teal-600, #0d9488) !important; }
  .ai-off { color: var(--cp-slate-400, #94a3b8) !important; font-size: 13px !important; }

  /* ═══ Card AI Actions ═══ */
  .card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }

  .ai-badge {
    font-size: 9px;
    font-weight: 600;
    background: linear-gradient(135deg, var(--cp-teal-50, #f0fdfa), var(--cp-teal-100, #ccfbf1));
    color: var(--cp-teal-700, #0f766e);
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 0.3px;
  }

  .card-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 6px;
    background: white;
    color: var(--cp-slate-500, #64748b);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms;
    font-family: inherit;
  }
  .card-ai-btn:hover:not(:disabled) {
    border-color: var(--cp-teal-300, #5eead4);
    color: var(--cp-teal-600, #0d9488);
    background: var(--cp-teal-50, #f0fdfa);
  }
  .card-ai-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .mini-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--cp-slate-200, #e2e8f0);
    border-top-color: var(--cp-teal-500, #14b8a6);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
</style>
