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
        showNotification(chrome.i18n.getMessage('contextCaptured') || 'Context captured!');
        await loadContexts();
      } else {
        showNotification(chrome.i18n.getMessage('captureFailed') || 'Capture failed', 'error');
      }
    } catch {
      showNotification(chrome.i18n.getMessage('captureFailed') || 'Capture failed', 'error');
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
    await sendMessage('openSidePanel');
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
  }

  async function loadHistory() {
    history = (await sendMessage('getPromptHistory')) || [];
  }

  onMount(async () => {
    await Promise.all([loadContexts(), loadTemplates(), loadSettings()]);
  });
</script>

<div class="popup-container">
  <!-- Notification Toast -->
  {#if notification}
    <div class="toast toast-{notification.type}">{notification.text}</div>
  {/if}

  <!-- Header -->
  <header class="header">
    {#if view === 'main'}
      <div class="header-left">
        <img src="/assets/icons/icon-48.png" alt="Logo" class="logo" />
        <span class="title">ContextPrompt AI</span>
        <span class="version">v4</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" title="Side Panel" onclick={openSidePanel}>📋</button>
        <button class="icon-btn" title="History" onclick={() => { view = 'history'; loadHistory(); }}>📜</button>
        <button class="icon-btn" title="Settings" onclick={() => (view = 'settings')}>⚙️</button>
      </div>
    {:else}
      <button class="back-btn" onclick={() => (view = 'main')}>
        ← {chrome.i18n.getMessage('back') || 'Back'}
      </button>
      <span class="title">
        {view === 'settings' ? (chrome.i18n.getMessage('settings') || 'Settings') : 'History'}
      </span>
    {/if}
  </header>

  <!-- Main View -->
  {#if view === 'main'}
    <button class="capture-btn" onclick={captureCurrentPage} disabled={loading}>
      {#if loading}
        <span class="spinner"></span>
      {:else}
        🎯
      {/if}
      {chrome.i18n.getMessage('capture') || 'Capture This Page'}
      <kbd>Ctrl+Shift+C</kbd>
    </button>

    <div class="toolbar">
      <select bind:value={selectedTemplate} class="template-select">
        {#each templates as t}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
      <button class="icon-btn" title="Clear All" onclick={clearAll}>🗑️</button>
    </div>

    <input
      type="text"
      class="search-input"
      placeholder="Search contexts..."
      bind:value={searchQuery}
    />

    <div class="context-list">
      {#if filteredContexts.length === 0}
        <div class="empty-state">
          <p>{chrome.i18n.getMessage('emptyTitle') || 'No captured contexts yet.'}</p>
          <p class="hint">{chrome.i18n.getMessage('emptyHint') || 'Visit any page and click "Capture"'}</p>
        </div>
      {:else}
        {#each filteredContexts as ctx}
          <div class="context-card">
            <div class="context-header">
              <span class="context-title" title={ctx.title}>{ctx.title}</span>
              <button class="delete-btn" onclick={() => deleteContext(ctx.id)}>×</button>
            </div>
            <div class="context-meta">
              <span class="context-time">{formatTime(ctx.timestamp)}</span>
              {#if ctx.platformName}
                <span class="context-platform">{ctx.platformName}</span>
              {/if}
            </div>
            {#if ctx.tags?.length > 0}
              <div class="context-tags">
                {#each ctx.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}
            <p class="context-desc">{ctx.aiSummary || ctx.description || ctx.selection || '—'}</p>
          </div>
        {/each}
      {/if}
    </div>

  <!-- Settings View -->
  {:else if view === 'settings'}
    <div class="settings-panel">
      <section>
        <h3>{chrome.i18n.getMessage('enableInjection') || 'Enable Button Injection'}</h3>
        <label class="toggle">
          <input type="checkbox" bind:checked={settings.enableInjection} onchange={saveSettingsAction} />
          <span class="toggle-slider"></span>
        </label>
      </section>

      <section>
        <h3>{chrome.i18n.getMessage('captureDepth') || 'Capture Depth'}</h3>
        <select bind:value={settings.captureDepth} onchange={saveSettingsAction}>
          <option value="light">Light</option>
          <option value="standard">Standard</option>
          <option value="deep">Deep</option>
        </select>
      </section>

      <section>
        <h3>{chrome.i18n.getMessage('aiIntegration') || 'AI Integration'}</h3>
        <label class="toggle">
          <input type="checkbox" bind:checked={settings.aiEnabled} onchange={saveSettingsAction} />
          <span class="toggle-slider"></span>
          <span>{chrome.i18n.getMessage('enableAI') || 'Enable AI'}</span>
        </label>

        {#if settings.aiEnabled}
          <div class="ai-settings">
            <label>
              {chrome.i18n.getMessage('apiProvider') || 'Provider'}
              <select bind:value={settings.aiProvider} onchange={saveSettingsAction}>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="anthropic">Anthropic</option>
                <option value="qwen">通义千问</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              {chrome.i18n.getMessage('apiKey') || 'API Key'}
              <input type="password" bind:value={settings.aiApiKey} onchange={saveSettingsAction} />
            </label>
            {#if settings.aiProvider === 'custom'}
              <label>
                Base URL
                <input type="text" bind:value={settings.aiBaseUrl} onchange={saveSettingsAction} />
              </label>
            {/if}
            <label>
              {chrome.i18n.getMessage('model') || 'Model'}
              <input type="text" bind:value={settings.aiModel} onchange={saveSettingsAction} />
            </label>
            <button class="test-btn" onclick={testConnection}>
              {chrome.i18n.getMessage('testConnection') || 'Test Connection'}
            </button>
          </div>
        {/if}
      </section>
    </div>

  <!-- History View -->
  {:else if view === 'history'}
    <div class="history-list">
      {#if history.length === 0}
        <p class="empty-state">No prompt history yet.</p>
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
  .popup-container {
    width: 400px;
    min-height: 500px;
    max-height: 600px;
    overflow-y: auto;
    font-family: var(--cp-font-sans, 'Inter', sans-serif);
    background: var(--cp-slate-50, #f8fafc);
    color: var(--cp-slate-800, #1e293b);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: white;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo { width: 24px; height: 24px; }
  .title { font-weight: 600; font-size: 15px; }
  .version {
    font-size: 10px;
    background: var(--cp-teal-100, #ccfbf1);
    color: var(--cp-teal-700, #0f766e);
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
  }

  .header-actions { display: flex; gap: 4px; }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    font-size: 16px;
    transition: background 150ms;
  }
  .icon-btn:hover { background: var(--cp-slate-100, #f1f5f9); }

  .back-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--cp-teal-600, #0d9488);
    font-weight: 500;
  }

  .capture-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: calc(100% - 32px);
    margin: 12px 16px;
    padding: 12px;
    background: linear-gradient(135deg, var(--cp-teal-500, #14b8a6), var(--cp-teal-600, #0d9488));
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 150ms, box-shadow 150ms;
  }
  .capture-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(13, 148, 136, 0.3); }
  .capture-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .capture-btn kbd {
    font-size: 10px;
    background: rgba(255,255,255,0.2);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--cp-font-mono, monospace);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .toolbar {
    display: flex;
    gap: 8px;
    padding: 0 16px 8px;
    align-items: center;
  }
  .template-select {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 6px;
    font-size: 13px;
    background: white;
  }

  .search-input {
    width: calc(100% - 32px);
    margin: 0 16px 12px;
    padding: 8px 12px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    font-size: 13px;
    outline: none;
    transition: border-color 150ms;
  }
  .search-input:focus { border-color: var(--cp-teal-400, #2dd4bf); }

  .context-list { padding: 0 16px 16px; }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--cp-slate-400, #94a3b8);
  }
  .hint { font-size: 12px; margin-top: 4px; }

  .context-card {
    background: white;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    transition: box-shadow 150ms;
  }
  .context-card:hover { box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1)); }

  .context-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .context-title {
    font-weight: 600;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
  }
  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cp-slate-400);
    font-size: 18px;
    line-height: 1;
    padding: 0 4px;
  }
  .delete-btn:hover { color: var(--cp-danger, #ef4444); }

  .context-meta {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
    margin-top: 4px;
  }
  .context-platform {
    background: var(--cp-teal-50, #f0fdfa);
    color: var(--cp-teal-600, #0d9488);
    padding: 0 6px;
    border-radius: 4px;
  }

  .context-tags {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    flex-wrap: wrap;
  }
  .tag {
    font-size: 10px;
    background: var(--cp-slate-100, #f1f5f9);
    color: var(--cp-slate-600, #475569);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .context-desc {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin-top: 6px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Settings */
  .settings-panel { padding: 16px; }
  .settings-panel section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--cp-slate-200, #e2e8f0);
  }
  .settings-panel h3 { font-size: 14px; margin: 0 0 8px; }
  .settings-panel label { display: block; margin-bottom: 8px; font-size: 13px; }
  .settings-panel select,
  .settings-panel input[type="text"],
  .settings-panel input[type="password"] {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 6px;
    font-size: 13px;
    margin-top: 4px;
    box-sizing: border-box;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .ai-settings {
    margin-top: 12px;
    padding: 12px;
    background: var(--cp-slate-50, #f8fafc);
    border-radius: 8px;
  }
  .test-btn {
    margin-top: 8px;
    padding: 6px 16px;
    background: var(--cp-teal-500, #14b8a6);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  /* History */
  .history-list { padding: 16px; }
  .history-card {
    background: white;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 8px;
  }
  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .history-title { font-weight: 600; font-size: 13px; }
  .history-time { font-size: 11px; color: var(--cp-slate-400, #94a3b8); }
  .history-prompt {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin-top: 6px;
    line-height: 1.4;
  }

  /* Toast */
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
</style>
