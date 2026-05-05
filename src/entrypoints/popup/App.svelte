<script lang="ts">
  import { onMount } from 'svelte';
  import { loadLocale, t as _t } from '@/lib/i18n';

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
  let stats = $state<{ papers: number; pages: number; summaries: number }>({ papers: 0, pages: 0, summaries: 0 });
  let aiStatus = $state<{ enabled: boolean; engine: string }>({ enabled: false, engine: 'Off' });
  let summarizingId = $state<string | null>(null);

  // Phase 3: History / Favorites
  let historyFilter = $state<'all' | 'favorites'>('all');

  // Phase 4: Template CRUD
  let editingTemplate = $state<{ id?: string; name: string; template: string } | null>(null);

  // Phase 5: Quality Analysis
  let qualityAnalysis = $state<any | null>(null);
  let analyzingQuality = $state(false);

  // Phase 6: Multi-select Fusion
  let multiSelectMode = $state(false);
  let selectedContextIds = $state<Set<string>>(new Set());
  let fuseResult = $state<string | null>(null);
  let fusing = $state(false);

  // ── i18n helper ──
  let localeVersion = $state(0);
  function t(key: string, fallback: string): string {
    void localeVersion;
    return _t(key, fallback);
  }

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

  let filteredHistory = $derived(
    historyFilter === 'favorites'
      ? history.filter((e) => e.favorite)
      : history
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
    if (diff < 60000) return t('justNow', 'Just now');
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── Theme ──
  function applyTheme(theme?: string) {
    const resolved = theme || settings.theme || 'system';
    if (resolved === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', resolved);
    }
  }

  // ── Actions ──
  async function captureCurrentPage() {
    loading = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
        showNotification(t('cannotCapture', 'Cannot capture this page'), 'error');
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
        showNotification(t('contextCaptured', 'Page captured successfully!'));
        await loadContexts();
        await loadStats();
      } else {
        showNotification(t('captureFailed', 'Capture failed'), 'error');
      }
    } catch {
      showNotification(t('captureFailed', 'Capture failed'), 'error');
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
        showNotification(t('contextCaptured', 'Captured') + ` ${count} pages`);
        await loadContexts();
        await loadStats();
      } else {
        showNotification(t('captureFailed', 'No pages captured'), 'error');
      }
    } catch {
      showNotification(t('captureFailed', 'Batch capture failed'), 'error');
    } finally {
      loading = false;
    }
  }

  async function deleteContext(id: string) {
    await sendMessage('deleteContext', { id });
    showNotification(t('deleted', 'Deleted'));
    selectedContextIds.delete(id);
    selectedContextIds = new Set(selectedContextIds);
    await loadContexts();
  }

  async function clearAll() {
    if (!confirm(t('confirmClearAll', 'Clear all contexts?'))) return;
    await sendMessage('clearAllContexts');
    showNotification(t('allCleared', 'All cleared'));
    await loadContexts();
  }

  async function openSidePanel() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch {
      await sendMessage('openSidePanel');
    }
  }

  async function saveSettingsAction() {
    await sendMessage('saveSettings', settings);
    applyTheme(settings.theme);
    await loadLocale(settings.language);
    localeVersion++;
    showNotification(t('save', 'Settings saved'));
  }

  async function testConnection() {
    const result = await sendMessage('testAIConnection');
    showNotification(
      result.success
        ? t('connectionSuccess', 'Connection successful!')
        : (t('connectionFailed', 'Connection failed') + ': ' + result.message),
      result.success ? 'success' : 'error'
    );
  }

  // Phase 3: History actions
  async function toggleFavorite(id: string) {
    await sendMessage('toggleFavorite', { id });
    await loadHistory();
  }

  async function copyHistoryPrompt(prompt: string) {
    await navigator.clipboard.writeText(prompt);
    showNotification(t('copied', 'Copied!'));
  }

  async function clearHistory() {
    if (!confirm(t('confirmClearHistory', 'Clear all prompt history?'))) return;
    await sendMessage('clearPromptHistory');
    history = [];
    showNotification(t('allCleared', 'History cleared'));
  }

  // Phase 4: Template CRUD
  async function saveTemplateAction() {
    if (!editingTemplate) return;
    await sendMessage('saveTemplate', {
      id: editingTemplate.id || crypto.randomUUID(),
      name: editingTemplate.name,
      template: editingTemplate.template,
    });
    editingTemplate = null;
    await loadTemplates();
    showNotification(t('save', 'Template saved'));
  }

  async function deleteTemplateAction(id: string) {
    if (!confirm(t('confirmDeleteTemplate', 'Delete this template?'))) return;
    await sendMessage('deleteTemplate', { id });
    await loadTemplates();
    showNotification(t('deleted', 'Deleted'));
  }

  // Phase 5: Quality Analysis
  async function analyzeQuality(contextId: string) {
    const ctx = contexts.find((c) => c.id === contextId);
    if (!ctx) return;
    analyzingQuality = true;
    qualityAnalysis = null;
    try {
      const prompt = ctx.aiSummary || ctx.description || ctx.selection || '';
      const result = await sendMessage('analyzePromptQuality', { prompt });
      qualityAnalysis = result?.analysis || result;
    } catch {
      showNotification(t('failed', 'Analysis failed'), 'error');
    } finally {
      analyzingQuality = false;
    }
  }

  // Phase 6: Fusion
  function toggleContextSelection(id: string) {
    const next = new Set(selectedContextIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedContextIds = next;
  }

  async function fuseSelectedContexts() {
    if (selectedContextIds.size < 2) {
      showNotification(t('selectAtLeast2', 'Select at least 2 contexts'), 'error');
      return;
    }
    fusing = true;
    fuseResult = null;
    try {
      const selected = contexts.filter((c) => selectedContextIds.has(c.id));
      const result = await sendMessage('fuseContexts', { contexts: selected });
      fuseResult = typeof result === 'string' ? result : result?.fusedContent || result?.result || result?.fused || JSON.stringify(result);
    } catch {
      showNotification(t('fuseFailed', 'Fusion failed'), 'error');
    } finally {
      fusing = false;
    }
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
        const idx = contexts.findIndex((c) => c.id === id);
        if (idx !== -1) {
          contexts[idx] = { ...contexts[idx], aiSummary: result.summary };
          contexts = [...contexts];
        }
        showNotification(t('aiSummaryReady', 'AI summary generated'));
      } else {
        showNotification(result?.error || t('failed', 'Summarize failed'), 'error');
      }
    } catch {
      showNotification(t('failed', 'Summarize failed'), 'error');
    } finally {
      summarizingId = null;
    }
  }

  async function loadHistory() {
    history = (await sendMessage('getPromptHistory')) || [];
  }

  async function loadStats() {
    try {
      const paperCount = contexts.filter((c) => c.paperMeta).length;
      const summaryCount = contexts.filter((c) => c.aiSummary).length;
      stats = {
        papers: paperCount,
        pages: contexts.length,
        summaries: summaryCount,
      };
    } catch { /* ignore */ }
  }

  onMount(async () => {
    await Promise.all([loadContexts(), loadTemplates(), loadSettings()]);
    await loadStats();
    await loadLocale(settings.language);
    applyTheme();
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.theme === 'system' || !settings.theme) applyTheme();
    });
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
                <stop stop-color="var(--accent)"/>
                <stop offset="1" stop-color="var(--accent-strong)"/>
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
        <button class="icon-btn" title={t('openSidePanel', 'Knowledge Panel')} onclick={openSidePanel}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2"/>
            <line x1="6" y1="2" x2="6" y2="14"/>
          </svg>
        </button>
        <button class="icon-btn" title={t('history', 'History')} onclick={() => { view = 'history'; loadHistory(); }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <polyline points="8,4.5 8,8 10.5,9.5"/>
          </svg>
        </button>
        <button class="icon-btn" title={t('settings', 'Settings')} onclick={() => (view = 'settings')}>
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
        {t('back', 'Back')}
      </button>
      <span class="header-section-title">
        {view === 'settings' ? t('settings', 'Settings') : t('history', 'History')}
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
        <span>{t('capture', 'Capture This Page')}</span>
        <kbd>Ctrl+Shift+C</kbd>
      </button>
      <button class="batch-btn" onclick={captureBatchTabs} disabled={loading} title={t('capture', 'Capture all open tabs')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="8" height="8" rx="1.5"/>
          <path d="M5 3V2a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1"/>
        </svg>
      </button>
    </div>

    <!-- Stats Strip -->
    <div class="stats-strip">
      <div class="stat-item">
        <span class="stat-value">{stats.papers}</span>
        <span class="stat-label">{t('papers', 'Papers')}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{stats.pages}</span>
        <span class="stat-label">{t('pages', 'Pages')}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{stats.summaries}</span>
        <span class="stat-label">{t('summaries', 'Summaries')}</span>
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
          placeholder={t('search', 'Search contexts...')}
          bind:value={searchQuery}
        />
      </div>
      <div class="filter-actions">
        <select bind:value={selectedTemplate} class="template-select">
          {#each templates as tpl}
            <option value={tpl.id}>{tpl.name}</option>
          {/each}
        </select>
        <!-- Multi-select toggle -->
        <button
          class="icon-btn-sm"
          class:active-toggle={multiSelectMode}
          title={t('multiSelectHint', 'Multi-select mode')}
          onclick={() => { multiSelectMode = !multiSelectMode; selectedContextIds = new Set(); fuseResult = null; }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="4" height="4" rx="0.5"/>
            <rect x="8" y="2" width="4" height="4" rx="0.5"/>
            <rect x="5" y="8" width="4" height="4" rx="0.5"/>
          </svg>
        </button>
        <button class="icon-btn-sm" title={t('clearAll', 'Clear All')} onclick={clearAll}>
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
          <p class="empty-title">{t('emptyTitle', 'No captured contexts')}</p>
          <p class="empty-hint">{t('emptyHint', 'Visit any page and click Capture to get started')}</p>
        </div>
      {:else}
        {#each filteredContexts as ctx}
          <div class="context-card" class:card-paper={!!ctx.paperMeta} class:card-selected={multiSelectMode && selectedContextIds.has(ctx.id)}>
            {#if multiSelectMode}
              <label class="card-checkbox">
                <input type="checkbox" checked={selectedContextIds.has(ctx.id)} onchange={() => toggleContextSelection(ctx.id)} />
                <span class="checkbox-mark"></span>
              </label>
            {/if}
            <div class="card-body">
              <div class="card-header">
                <div class="card-title-row">
                  <span class="card-title" title={ctx.title}>{ctx.title}</span>
                  <button class="card-delete" onclick={() => deleteContext(ctx.id)} title={t('delete', 'Delete')}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                      <line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/>
                      <line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/>
                    </svg>
                  </button>
                </div>
                <div class="card-meta">
                  <span class="card-time">{formatTime(ctx.timestamp)}</span>
                  {#if ctx.paperMeta}
                    <span class="card-paper-badge">
                      {#if ctx.paperMeta.source === 'arxiv'}arXiv{:else if ctx.paperMeta.source === 'openreview'}OpenReview{:else if ctx.paperMeta.source === 'cvpr'}CVPR{:else}{ctx.paperMeta.source}{/if}
                    </span>
                    {#if ctx.paperMeta.arxivId}
                      <span class="card-arxiv-id">{ctx.paperMeta.arxivId}</span>
                    {/if}
                  {:else if ctx.platformName}
                    <span class="card-platform">{ctx.platformName}</span>
                  {/if}
                </div>
              </div>

              <!-- Paper-specific: Authors & Abstract -->
              {#if ctx.paperMeta}
                {#if ctx.paperMeta.authors?.length > 0}
                  <p class="card-authors">{ctx.paperMeta.authors.slice(0, 3).join(', ')}{ctx.paperMeta.authors.length > 3 ? ` +${ctx.paperMeta.authors.length - 3}` : ''}</p>
                {/if}
                {#if ctx.paperMeta.abstract}
                  <p class="card-abstract">{ctx.paperMeta.abstract.slice(0, 180)}{ctx.paperMeta.abstract.length > 180 ? '...' : ''}</p>
                {/if}
                {#if ctx.paperMeta.citedBy !== undefined || ctx.paperMeta.firstAuthorHIndex !== undefined}
                  <div class="card-enrichment">
                    {#if ctx.paperMeta.citedBy !== undefined}
                      <span class="enrichment-item">
                        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 12V3a1 1 0 011-1h5l4 4v6a1 1 0 01-1 1H3a1 1 0 01-1-1z"/><path d="M8 2v4h4"/></svg>
                        {ctx.paperMeta.citedBy} citations
                      </span>
                    {/if}
                    {#if ctx.paperMeta.firstAuthorHIndex !== undefined}
                      <span class="enrichment-item">
                        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M7 1v12M1 7h12"/></svg>
                        h-index: {ctx.paperMeta.firstAuthorHIndex}
                      </span>
                    {/if}
                  </div>
                {/if}
              {:else}
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
              {/if}

              <p class="card-desc">{ctx.aiSummary || ctx.description || ctx.selection || '—'}</p>
              <div class="card-actions">
                {#if ctx.aiSummary}
                  <span class="ai-badge">AI</span>
                {/if}
                <button
                  class="card-ai-btn"
                  class:card-ai-btn-primary={!!ctx.paperMeta && !ctx.aiSummary}
                  onclick={(e: MouseEvent) => { e.stopPropagation(); summarizeCard(ctx.id); }}
                  disabled={summarizingId === ctx.id}
                  title={ctx.aiSummary ? t('aiSummarize', 'Re-generate AI Summary') : t('aiSummarize', 'Generate AI Summary')}
                >
                  {#if summarizingId === ctx.id}
                    <span class="mini-spinner"></span>
                  {:else}
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41"/>
                      <circle cx="7" cy="7" r="3"/>
                    </svg>
                  {/if}
                  {ctx.paperMeta ? t('summarizePaper', 'Summarize Paper') : t('aiSummarize', 'AI Summary')}
                </button>
                <!-- Quality Analysis (secondary) -->
                <button
                  class="card-ai-btn"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); analyzeQuality(ctx.id); }}
                  disabled={analyzingQuality}
                  title={t('analyzeQuality', 'Analyze Quality')}
                >
                  {#if analyzingQuality}
                    <span class="mini-spinner"></span>
                  {:else}
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M7 1v12M1 7h12"/>
                      <circle cx="7" cy="7" r="5"/>
                    </svg>
                  {/if}
                  {t('analyzeQuality', 'Quality')}
                </button>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Phase 5: Quality Analysis Result -->
    {#if qualityAnalysis}
      <div class="quality-panel">
        <div class="quality-header">
          <h4>{t('quality', 'Quality Analysis')}</h4>
          <button class="close-btn" aria-label={t('close', 'Close')} title={t('close', 'Close')} onclick={() => (qualityAnalysis = null)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/>
            </svg>
          </button>
        </div>
        <div class="quality-scores">
          <div class="score-item"><span class="score-label">{t('clarity', 'Clarity')}</span><span class="score-value">{qualityAnalysis.clarity}/10</span></div>
          <div class="score-item"><span class="score-label">{t('specificity', 'Specificity')}</span><span class="score-value">{qualityAnalysis.specificity}/10</span></div>
          <div class="score-item"><span class="score-label">{t('completeness', 'Completeness')}</span><span class="score-value">{qualityAnalysis.completeness}/10</span></div>
          <div class="score-item score-overall"><span class="score-label">{t('overall', 'Overall')}</span><span class="score-value">{qualityAnalysis.overall}/10</span></div>
        </div>
        {#if qualityAnalysis.suggestions?.length > 0}
          <div class="quality-section">
            <h5>{t('suggestions', 'Suggestions')}</h5>
            <ul>{#each qualityAnalysis.suggestions as s}<li>{s}</li>{/each}</ul>
          </div>
        {/if}
        {#if qualityAnalysis.improvedPrompt}
          <div class="quality-section">
            <h5>{t('improvedPrompt', 'Improved Prompt')}</h5>
            <p class="improved-prompt">{qualityAnalysis.improvedPrompt}</p>
            <button class="card-ai-btn" onclick={async () => { await navigator.clipboard.writeText(qualityAnalysis.improvedPrompt); showNotification(t('copied', 'Copied!')); }}>
              {t('copy', 'Copy')}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Phase 6: Fuse Action Bar -->
    {#if multiSelectMode && selectedContextIds.size >= 2}
      <div class="fuse-bar">
        <span class="fuse-count">{selectedContextIds.size} {t('contexts', 'selected')}</span>
        <button class="fuse-btn" onclick={fuseSelectedContexts} disabled={fusing}>
          {#if fusing}
            <span class="mini-spinner"></span>
          {/if}
          {t('fuse', 'Fuse')}
        </button>
      </div>
    {/if}

    <!-- Phase 6: Fuse Result -->
    {#if fuseResult}
      <div class="fuse-result">
        <div class="quality-header">
          <h4>{t('fuse', 'Fuse Result')}</h4>
          <button class="close-btn" aria-label={t('close', 'Close')} title={t('close', 'Close')} onclick={() => { fuseResult = null; }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/>
            </svg>
          </button>
        </div>
        <p class="fuse-text">{fuseResult}</p>
        <button class="card-ai-btn" onclick={async () => { await navigator.clipboard.writeText(fuseResult!); showNotification(t('copied', 'Copied!')); }}>
          {t('copy', 'Copy')}
        </button>
      </div>
    {/if}

  <!-- Settings View -->
  {:else if view === 'settings'}
    <div class="settings">
      <!-- Theme Settings (Phase 2) -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="4"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>
          </svg>
          <h3>{t('theme', 'Theme')}</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{t('theme', 'Theme')}</span>
          </div>
          <select class="setting-select" bind:value={settings.theme} onchange={saveSettingsAction}>
            <option value="system">{t('themeSystem', 'System')}</option>
            <option value="light">{t('themeLight', 'Light')}</option>
            <option value="dark">{t('themeDark', 'Dark')}</option>
          </select>
        </div>
      </section>

      <!-- Language Settings -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <path d="M2 8h12M8 2c-2 2.5-2 9.5 0 12M8 2c2 2.5 2 9.5 0 12"/>
          </svg>
          <h3>{t('language', 'Language')}</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{t('language', 'Language')}</span>
            <span class="setting-desc">{t('languageDesc', 'UI and AI response language')}</span>
          </div>
          <select class="setting-select" bind:value={settings.language} onchange={saveSettingsAction}>
            <option value="auto">{t('langAuto', 'Auto')}</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </section>

      <!-- Capture Settings -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <circle cx="8" cy="8" r="2.5"/>
          </svg>
          <h3>{t('captureSettings', 'Capture')}</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{t('enableInjection', 'Button Injection')}</span>
            <span class="setting-desc">{t('enableInjectionDesc', 'Inject capture button into pages')}</span>
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
            <span class="setting-label">{t('captureDepth', 'Capture Depth')}</span>
          </div>
          <select class="setting-select" bind:value={settings.captureDepth} onchange={saveSettingsAction}>
            <option value="light">{t('depthLight', 'Light')}</option>
            <option value="standard">{t('depthStandard', 'Standard')}</option>
            <option value="deep">{t('depthDeep', 'Deep')}</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{t('autoCapture', 'Auto Capture')}</span>
            <span class="setting-desc">{t('autoCaptureDesc', 'Capture on URL pattern match')}</span>
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
          <h3>{t('aiIntegration', 'AI Integration')}</h3>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{t('enableAI', 'Enable AI')}</span>
            <span class="setting-desc">{t('enableAIDesc', 'Cloud AI for summaries & analysis')}</span>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={settings.aiEnabled} onchange={saveSettingsAction} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>

        <div class="ai-config" class:ai-config-disabled={!settings.aiEnabled}>
          <div class="ai-provider-grid">
            {#each [
              { id: 'openai', name: 'OpenAI', icon: 'O' },
              { id: 'deepseek', name: 'DeepSeek', icon: 'D' },
              { id: 'anthropic', name: 'Anthropic', icon: 'A' },
              { id: 'qwen', name: 'Qwen', icon: 'Q' },
              { id: 'custom', name: 'Custom', icon: '⚙' },
            ] as provider}
              <button
                class="ai-provider-btn"
                class:ai-provider-active={settings.aiProvider === provider.id}
                onclick={() => { settings.aiProvider = provider.id; settings.aiEnabled = true; saveSettingsAction(); }}
              >
                <span class="ai-provider-icon">{provider.icon}</span>
                <span class="ai-provider-name">{provider.name}</span>
              </button>
            {/each}
          </div>
          <label class="field">
            <span class="field-label">{t('apiKey', 'API Key')}</span>
            <input class="field-input" type="password" bind:value={settings.aiApiKey} onchange={saveSettingsAction} placeholder="sk-..." />
          </label>
          {#if settings.aiProvider === 'custom'}
            <label class="field">
              <span class="field-label">{t('customBaseUrl', 'Base URL')}</span>
              <input class="field-input" type="text" bind:value={settings.aiBaseUrl} onchange={saveSettingsAction} placeholder="https://..." />
            </label>
          {/if}
          <label class="field">
            <span class="field-label">{t('model', 'Model')}</span>
            <input class="field-input" type="text" bind:value={settings.aiModel} onchange={saveSettingsAction} placeholder="gpt-4o-mini" />
          </label>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">{t('autoSummarize', 'Auto Summarize')}</span>
              <span class="setting-desc">{t('autoSummarizeDesc', 'Summarize on capture')}</span>
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
            {t('testConnection', 'Test Connection')}
          </button>
        </div>
      </section>

      <!-- Phase 4: Template CRUD -->
      <section class="settings-group">
        <div class="settings-group-header">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--cp-teal-500)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="1" width="12" height="14" rx="2"/>
            <line x1="5" y1="5" x2="11" y2="5"/>
            <line x1="5" y1="8" x2="11" y2="8"/>
            <line x1="5" y1="11" x2="9" y2="11"/>
          </svg>
          <h3>{t('promptTemplate', 'Templates')}</h3>
        </div>
        {#each templates.filter(tpl => tpl.id !== 'standard' && tpl.id !== 'default') as tpl}
          <div class="template-row">
            <span class="template-name">{tpl.name}</span>
            <div class="template-actions">
              <button class="icon-btn-xs" title={t('edit', 'Edit')} onclick={() => (editingTemplate = { id: tpl.id, name: tpl.name, template: tpl.template })}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 1.5l2 2L4 10H2v-2z"/>
                </svg>
              </button>
              <button class="icon-btn-xs" title={t('delete', 'Delete')} onclick={() => deleteTemplateAction(tpl.id)}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                  <line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/>
                </svg>
              </button>
            </div>
          </div>
        {/each}
        {#if editingTemplate}
          <div class="template-editor">
            <label class="field">
              <span class="field-label">{t('templateName', 'Name')}</span>
              <input class="field-input" type="text" bind:value={editingTemplate.name} placeholder="My Template" />
            </label>
            <label class="field">
              <span class="field-label">{t('templateContent', 'Template')}</span>
              <textarea class="field-input field-textarea" bind:value={editingTemplate.template} placeholder={t('templatePlaceholders', '{title} {url} {summary} ...')} rows="4"></textarea>
            </label>
            <div class="template-editor-actions">
              <button class="test-btn" onclick={saveTemplateAction}>{t('save', 'Save')}</button>
              <button class="card-ai-btn" onclick={() => (editingTemplate = null)}>{t('cancel', 'Cancel')}</button>
            </div>
          </div>
        {:else}
          <button class="test-btn" style="margin-top: 8px;" onclick={() => (editingTemplate = { name: '', template: '' })}>
            + {t('addTemplate', 'Add Template')}
          </button>
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
            <span class="setting-label">{t('enableAI', 'Enable MCP Server')}</span>
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
            <span class="setting-label">{t('enableAI', 'Enable Knowledge Graph')}</span>
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
            <span class="setting-label">{t('localFirst', 'Local AI (Gemini Nano)')}</span>
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
            showNotification(t('exportSuccess', 'Data exported'));
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 2v7M4 6.5l3 3 3-3M2 11v1h10v-1"/>
            </svg>
            {t('export', 'Export')}
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
              showNotification(t('importSuccess', 'Data imported'));
              await loadContexts();
              await loadStats();
            };
            input.click();
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 9V2M4 4.5l3-3 3 3M2 11v1h10v-1"/>
            </svg>
            {t('import', 'Import')}
          </button>
        </div>
      </section>
    </div>

  <!-- History View (Phase 3 enhanced) -->
  {:else if view === 'history'}
    <div class="history-tabs">
      <button class="history-tab" class:active={historyFilter === 'all'} onclick={() => (historyFilter = 'all')}>
        {t('history', 'All')}
      </button>
      <button class="history-tab" class:active={historyFilter === 'favorites'} onclick={() => (historyFilter = 'favorites')}>
        {t('favorites', 'Favorites')}
      </button>
      {#if history.length > 0}
        <button class="history-clear-btn" onclick={clearHistory} title={t('clearAll', 'Clear All')}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4"/>
          </svg>
        </button>
      {/if}
    </div>
    <div class="history-list">
      {#if filteredHistory.length === 0}
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="14" stroke="var(--cp-slate-300)" stroke-width="1.5"/>
            <polyline points="20,10 20,20 26,23" stroke="var(--cp-teal-400)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <p class="empty-title">{historyFilter === 'favorites' ? t('noFavorites', 'No favorites yet') : t('noHistory', 'No prompt history')}</p>
          <p class="empty-hint">{t('emptyHint', 'Generated prompts will appear here')}</p>
        </div>
      {:else}
        {#each filteredHistory as entry}
          <div class="history-card">
            <div class="history-header">
              <span class="history-title">{entry.contextTitle || t('untitled', 'Untitled')}</span>
              <div class="history-actions">
                <button class="icon-btn-xs" class:fav-active={entry.favorite} title={entry.favorite ? t('unfavorite', 'Unfavorite') : t('favorite', 'Favorite')} onclick={() => toggleFavorite(entry.id)}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill={entry.favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.3">
                    <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.5l-3.52 1.85.67-3.93L1.3 5.64l3.94-.57z"/>
                  </svg>
                </button>
                <button class="icon-btn-xs" title={t('copy', 'Copy')} onclick={() => copyHistoryPrompt(entry.prompt)}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="6.5" height="6.5" rx="1"/>
                    <path d="M2 8V2.5a.5.5 0 01.5-.5H8"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="history-meta">
              <span class="history-time">{formatTime(entry.timestamp)}</span>
              {#if entry.template}
                <span class="history-template">{entry.template}</span>
              {/if}
            </div>
            <p class="history-prompt">{entry.prompt.substring(0, 200)}{entry.prompt.length > 200 ? '...' : ''}</p>
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
    font-family: var(--font-body);
    background: var(--cp-slate-50, var(--bg));
    color: var(--cp-slate-800, #1e293b);
    position: relative;
  }

  /* ═══ Header ═══ */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--cp-white, var(--bg));
    border-bottom: 1px solid var(--cp-slate-200, var(--border));
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header-left { display: flex; align-items: center; gap: 10px; }

  .logo-mark {
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--accent-soft) 0%, var(--accent-soft) 100%);
    border-radius: 10px;
  }

  .header-title-group { display: flex; align-items: center; gap: 6px; }
  .title { font-weight: 700; font-size: 15px; letter-spacing: -0.3px; }

  .badge {
    font-size: 9px; font-weight: 600;
    background: var(--accent);
    color: white; padding: 1px 7px; border-radius: 10px; letter-spacing: 0.3px;
  }

  .header-actions { display: flex; gap: 2px; }

  .header-section-title {
    font-weight: 600; font-size: 15px; position: absolute; left: 50%; transform: translateX(-50%);
  }

  .icon-btn {
    background: none; border: none; cursor: pointer; padding: 7px; border-radius: 8px;
    color: var(--cp-slate-500, #64748b); transition: all 150ms;
    display: flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { background: var(--surface); color: var(--cp-teal-600, var(--accent-strong)); }

  .back-btn {
    display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer;
    font-size: 13px; color: var(--cp-teal-600, var(--accent-strong)); font-weight: 500; padding: 4px 0; font-family: inherit;
  }
  .back-btn:hover { color: var(--accent-strong); }

  /* ═══ Hero Capture ═══ */
  .hero-section { display: flex; gap: 8px; padding: 12px 14px 8px; }

  .capture-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1;
    padding: 11px 16px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 50%, var(--accent-strong) 100%);
    color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 2px 8px rgba(194, 65, 12, 0.25); font-family: inherit;
    position: relative; overflow: hidden;
  }
  .capture-btn::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%); pointer-events: none;
  }
  .capture-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(194, 65, 12, 0.35); }
  .capture-btn:active:not(:disabled) { transform: translateY(0); }
  .capture-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .capture-btn kbd {
    font-size: 9px; background: rgba(255, 255, 255, 0.18); padding: 2px 6px; border-radius: 4px;
    font-family: var(--cp-font-mono, monospace); font-weight: 500; border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .batch-btn {
    display: flex; align-items: center; justify-content: center; width: 42px;
    background: var(--bg); border: 1px solid var(--cp-slate-200, var(--border));
    border-radius: 12px; cursor: pointer; color: var(--cp-slate-500, #64748b); transition: all 150ms;
  }
  .batch-btn:hover { border-color: var(--cp-teal-300, var(--accent)); color: var(--cp-teal-600, var(--accent-strong)); background: var(--accent-soft); }
  .batch-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner {
    width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite;
  }

  /* ═══ Stats Strip ═══ */
  .stats-strip {
    display: flex; align-items: center; justify-content: center; gap: 0; padding: 8px 14px;
    margin: 0 14px 8px; background: var(--bg); border-radius: 10px;
    border: 1px solid var(--surface);
  }
  .stat-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .stat-value { font-size: 16px; font-weight: 700; color: var(--cp-slate-800, #1e293b); line-height: 1.2; }
  .stat-label { font-size: 10px; color: var(--cp-slate-400, #94a3b8); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-divider { width: 1px; height: 24px; background: var(--surface); }

  /* ═══ Filter Bar ═══ */
  .filter-bar { padding: 0 14px 8px; display: flex; gap: 8px; align-items: center; }
  .search-wrapper { flex: 1; position: relative; display: flex; align-items: center; }
  .search-icon { position: absolute; left: 10px; color: var(--cp-slate-400, #94a3b8); pointer-events: none; }
  .search-input {
    width: 100%; padding: 7px 10px 7px 32px; border: 1px solid var(--cp-slate-200, var(--border));
    border-radius: 8px; font-size: 12.5px; outline: none; background: var(--bg);
    transition: border-color 150ms, box-shadow 150ms; font-family: inherit; box-sizing: border-box;
    color: var(--cp-slate-800, #1e293b);
  }
  .search-input:focus { border-color: var(--cp-teal-400, var(--accent)); box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.1); }
  .filter-actions { display: flex; gap: 4px; align-items: center; }
  .template-select {
    padding: 6px 8px; border: 1px solid var(--cp-slate-200, var(--border)); border-radius: 8px;
    font-size: 12px; background: var(--bg); color: var(--cp-slate-600, #475569); cursor: pointer; font-family: inherit;
  }

  .icon-btn-sm {
    display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    background: none; border: 1px solid var(--cp-slate-200, var(--border)); border-radius: 8px;
    cursor: pointer; color: var(--cp-slate-400, #94a3b8); transition: all 150ms;
  }
  .icon-btn-sm:hover { border-color: var(--cp-danger, #ef4444); color: var(--cp-danger, #ef4444); background: var(--cp-danger-light, #fee2e2); }
  .icon-btn-sm.active-toggle { border-color: var(--cp-teal-400, var(--accent)); color: var(--cp-teal-600, var(--accent-strong)); background: var(--accent-soft); }
  .icon-btn-sm.active-toggle:hover { border-color: var(--cp-teal-500); }

  /* ═══ Context List ═══ */
  .context-list { padding: 0 14px 14px; }
  .empty-state { text-align: center; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--cp-slate-500, #64748b); margin: 0; }
  .empty-hint { font-size: 12px; color: var(--cp-slate-400, #94a3b8); margin: 0; }

  .context-card {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--bg); border: 1px solid var(--surface);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; transition: all 200ms; cursor: default;
  }
  .context-card:hover { border-color: var(--cp-slate-200, var(--border)); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
  .context-card.card-paper { border-left: 3px solid var(--accent); }
  .context-card.card-selected { border-color: var(--cp-teal-400, var(--accent)); background: var(--accent-soft); }
  .card-body { flex: 1; min-width: 0; }

  .card-checkbox { display: flex; align-items: center; padding-top: 2px; cursor: pointer; }
  .card-checkbox input { display: none; }
  .checkbox-mark {
    width: 16px; height: 16px; border: 2px solid var(--cp-slate-300, #cbd5e1); border-radius: 4px;
    display: flex; align-items: center; justify-content: center; transition: all 150ms;
  }
  .card-checkbox input:checked + .checkbox-mark {
    background: var(--cp-teal-500, var(--accent)); border-color: var(--cp-teal-500, var(--accent));
  }
  .card-checkbox input:checked + .checkbox-mark::after {
    content: ''; width: 6px; height: 3px; border-left: 2px solid white; border-bottom: 2px solid white;
    transform: rotate(-45deg); margin-top: -1px;
  }

  .card-header { margin-bottom: 6px; }
  .card-title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .card-title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--cp-slate-800, #1e293b); }

  .card-delete {
    background: none; border: none; cursor: pointer; color: var(--cp-slate-300, #cbd5e1); padding: 2px;
    border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 150ms; flex-shrink: 0;
  }
  .card-delete:hover { color: var(--cp-danger, #ef4444); background: var(--cp-danger-light, #fee2e2); }

  .card-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--cp-slate-400, #94a3b8); margin-top: 2px; }
  .card-platform { background: linear-gradient(135deg, var(--cp-teal-50), var(--cp-teal-100)); color: var(--cp-teal-700); padding: 0 6px; border-radius: 4px; font-size: 10px; font-weight: 500; }
  .card-paper-badge {
    background: var(--accent-soft); color: var(--accent-strong);
    padding: 0 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  .card-arxiv-id { font-size: 10px; color: var(--cp-slate-400, #94a3b8); font-family: var(--cp-font-mono, monospace); }
  .card-authors { font-size: 11px; color: var(--cp-slate-500, #64748b); margin: 4px 0 2px; font-style: italic; line-height: 1.4; }
  .card-abstract { font-size: 11.5px; color: var(--cp-slate-600, #475569); margin: 4px 0; line-height: 1.5; display: -webkit-box; line-clamp: 3; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-enrichment { display: flex; gap: 10px; margin: 4px 0; }
  .enrichment-item { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: var(--cp-slate-400, #94a3b8); font-weight: 500; }
  .card-tags { display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; }
  .tag { font-size: 10px; background: var(--surface); color: var(--cp-slate-600, #475569); padding: 1px 7px; border-radius: 4px; font-weight: 500; }
  .tag-more { color: var(--cp-slate-400, #94a3b8); background: transparent; padding-left: 2px; }
  .card-desc { font-size: 12px; color: var(--cp-slate-500, #64748b); margin: 0; line-height: 1.5; display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  /* ═══ Settings ═══ */
  .settings { padding: 10px 14px 14px; }
  .settings-group { background: var(--bg); border: 1px solid var(--surface); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
  .settings-group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--surface); }
  .settings-group-header h3 { font-size: 13px; font-weight: 600; margin: 0; color: var(--cp-slate-800, #1e293b); }
  .setting-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
  .setting-info { display: flex; flex-direction: column; gap: 1px; }
  .setting-label { font-size: 13px; font-weight: 500; color: var(--cp-slate-700, #334155); }
  .setting-desc { font-size: 11px; color: var(--cp-slate-400, #94a3b8); }
  .setting-select { padding: 5px 8px; border: 1px solid var(--cp-slate-200, var(--border)); border-radius: 6px; font-size: 12px; background: var(--bg); color: var(--cp-slate-600, #475569); font-family: inherit; }

  /* Toggle */
  .toggle { position: relative; display: inline-flex; cursor: pointer; flex-shrink: 0; }
  .toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle-track { width: 36px; height: 20px; background: var(--cp-slate-200, var(--border)); border-radius: 10px; position: relative; transition: background 200ms; }
  .toggle input:checked + .toggle-track { background: var(--accent); }
  .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
  .toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(16px); }

  /* AI Config */
  .ai-config { margin-top: 8px; padding: 12px; background: var(--cp-slate-50, var(--bg)); border-radius: 10px; border: 1px solid var(--surface); transition: opacity 150ms; }
  .ai-config-disabled { opacity: 0.55; }

  /* AI Provider Grid */
  .ai-provider-grid {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px;
  }
  .ai-provider-btn {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 8px 4px; border: 1.5px solid var(--cp-slate-200, var(--border)); border-radius: 8px;
    background: var(--bg); cursor: pointer; transition: all 150ms;
    font-family: inherit;
  }
  .ai-provider-btn:hover { border-color: var(--cp-teal-300, var(--accent)); background: var(--accent-soft); }
  .ai-provider-active { border-color: var(--cp-teal-500, var(--accent)); background: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent-soft); }
  .ai-provider-icon { font-size: 16px; font-weight: 700; color: var(--cp-teal-600, var(--accent-strong)); line-height: 1; }
  .ai-provider-active .ai-provider-icon { color: var(--accent-strong); }
  .ai-provider-name { font-size: 9px; font-weight: 600; color: var(--cp-slate-500, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .field { display: block; margin-bottom: 10px; cursor: default; }
  .field-label { display: block; font-size: 11px; font-weight: 600; color: var(--cp-slate-500, #64748b); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
  .field-input {
    width: 100%; padding: 7px 10px; border: 1px solid var(--cp-slate-200, var(--border)); border-radius: 8px;
    font-size: 13px; outline: none; background: var(--bg); transition: border-color 150ms;
    font-family: inherit; box-sizing: border-box; color: var(--cp-slate-800, #1e293b);
  }
  .field-input:focus { border-color: var(--cp-teal-400, var(--accent)); }
  .field-textarea { resize: vertical; min-height: 60px; line-height: 1.5; }

  .test-btn {
    display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; padding: 7px 14px;
    background: var(--bg); border: 1px solid var(--cp-teal-300, var(--accent));
    color: var(--accent-strong); border-radius: 8px; cursor: pointer; font-size: 12px;
    font-weight: 500; transition: all 150ms; font-family: inherit;
  }
  .test-btn:hover { background: var(--accent-soft); border-color: var(--cp-teal-400, var(--accent)); }

  /* Template CRUD */
  .template-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--cp-slate-50, var(--bg)); }
  .template-name { font-size: 13px; font-weight: 500; color: var(--cp-slate-700, #334155); }
  .template-actions { display: flex; gap: 4px; }
  .icon-btn-xs {
    display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
    background: none; border: 1px solid transparent; border-radius: 6px;
    cursor: pointer; color: var(--cp-slate-400, #94a3b8); transition: all 150ms;
  }
  .icon-btn-xs:hover { border-color: var(--cp-slate-200, var(--border)); color: var(--cp-slate-600, #475569); background: var(--cp-slate-50, var(--bg)); }
  .template-editor { margin-top: 10px; padding: 10px; background: var(--cp-slate-50, var(--bg)); border-radius: 8px; border: 1px solid var(--surface); }
  .template-editor-actions { display: flex; gap: 6px; margin-top: 8px; }

  /* Data */
  .data-actions { display: flex; gap: 8px; }
  .data-btn {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 12px; background: var(--bg); border: 1px solid var(--cp-slate-200, var(--border));
    border-radius: 8px; font-size: 12px; font-weight: 500; color: var(--cp-slate-600, #475569);
    cursor: pointer; transition: all 150ms; font-family: inherit;
  }
  .data-btn:hover { border-color: var(--cp-slate-300, #cbd5e1); background: var(--cp-slate-50, var(--bg)); }

  /* ═══ History (Phase 3) ═══ */
  .history-tabs {
    display: flex; gap: 2px; padding: 8px 14px 0; align-items: center;
    border-bottom: 1px solid var(--cp-slate-200, var(--border));
  }
  .history-tab {
    padding: 6px 14px; border: none; background: none; cursor: pointer; font-size: 12.5px;
    font-weight: 500; color: var(--cp-slate-400, #94a3b8); border-bottom: 2px solid transparent;
    margin-bottom: -1px; transition: all 150ms; font-family: inherit;
  }
  .history-tab:hover { color: var(--cp-slate-600, #475569); }
  .history-tab.active { color: var(--cp-teal-600, var(--accent-strong)); border-bottom-color: var(--cp-teal-500, var(--accent)); }
  .history-clear-btn {
    margin-left: auto; display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; background: none; border: 1px solid var(--cp-slate-200, var(--border));
    border-radius: 6px; cursor: pointer; color: var(--cp-slate-400, #94a3b8); transition: all 150ms;
  }
  .history-clear-btn:hover { border-color: var(--cp-danger, #ef4444); color: var(--cp-danger, #ef4444); }

  .history-list { padding: 10px 14px; }
  .history-card {
    background: var(--bg); border: 1px solid var(--surface);
    border-radius: 10px; padding: 12px; margin-bottom: 8px; transition: border-color 150ms;
  }
  .history-card:hover { border-color: var(--cp-slate-200, var(--border)); }
  .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .history-title { font-weight: 600; font-size: 13px; color: var(--cp-slate-800, #1e293b); }
  .history-actions { display: flex; gap: 2px; }
  .history-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
  .history-time { font-size: 11px; color: var(--cp-slate-400, #94a3b8); }
  .history-template { font-size: 10px; background: var(--surface); color: var(--cp-slate-500, #64748b); padding: 1px 6px; border-radius: 4px; }
  .history-prompt { font-size: 12px; color: var(--cp-slate-500, #64748b); margin: 0; line-height: 1.5; display: -webkit-box; line-clamp: 3; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .fav-active { color: var(--cp-warning, #f59e0b) !important; }

  /* ═══ Quality Panel (Phase 5) ═══ */
  .quality-panel, .fuse-result {
    margin: 0 14px 14px; padding: 14px; background: var(--bg);
    border: 1px solid var(--cp-slate-200, var(--border)); border-radius: 12px;
  }
  .quality-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .quality-header h4 { font-size: 14px; font-weight: 600; margin: 0; color: var(--cp-slate-800, #1e293b); }
  .close-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: var(--surface); border-radius: 50%; cursor: pointer; color: var(--cp-slate-400, #94a3b8); transition: all 150ms; }
  .close-btn:hover { background: var(--cp-slate-200, var(--border)); }
  .quality-scores { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .score-item { display: flex; justify-content: space-between; padding: 6px 10px; background: var(--cp-slate-50, var(--bg)); border-radius: 6px; font-size: 12px; }
  .score-label { color: var(--cp-slate-500, #64748b); font-weight: 500; }
  .score-value { color: var(--cp-teal-600, var(--accent-strong)); font-weight: 700; }
  .score-overall { grid-column: 1 / -1; background: var(--accent-soft); }
  .quality-section h5 { font-size: 11px; font-weight: 600; color: var(--cp-slate-500, #64748b); margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.3px; }
  .quality-section ul { margin: 0; padding-left: 16px; font-size: 12px; color: var(--cp-slate-600, #475569); line-height: 1.6; }
  .quality-section { margin-bottom: 10px; }
  .improved-prompt { font-size: 12px; color: var(--cp-slate-700, #334155); margin: 0 0 8px; line-height: 1.5; padding: 8px; background: var(--cp-slate-50, var(--bg)); border-radius: 6px; }

  /* ═══ Fuse Bar (Phase 6) ═══ */
  .fuse-bar {
    position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; background: var(--bg); border-top: 1px solid var(--cp-slate-200, var(--border));
    z-index: 10;
  }
  .fuse-count { font-size: 12px; font-weight: 500; color: var(--cp-slate-500, #64748b); }
  .fuse-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 18px;
    background: var(--accent);
    color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 150ms; font-family: inherit;
  }
  .fuse-btn:hover { box-shadow: 0 2px 8px rgba(194, 65, 12, 0.3); }
  .fuse-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .fuse-text { font-size: 12px; color: var(--cp-slate-600, #475569); margin: 0 0 8px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }

  /* ═══ Toast ═══ */
  .toast {
    position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
    border-radius: 10px; font-size: 12.5px; font-weight: 500; z-index: 100;
    animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12); white-space: nowrap;
  }
  .toast-success { background: var(--cp-success, #10b981); color: white; }
  .toast-error { background: var(--cp-danger, #ef4444); color: white; }
  .toast-icon { flex-shrink: 0; }

  @keyframes slideDown {
    from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .ai-on { color: var(--cp-teal-600, var(--accent-strong)) !important; }
  .ai-off { color: var(--cp-slate-400, #94a3b8) !important; font-size: 13px !important; }

  /* Card AI Actions */
  .card-actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .ai-badge { font-size: 9px; font-weight: 600; background: linear-gradient(135deg, var(--cp-teal-50), var(--cp-teal-100)); color: var(--cp-teal-700); padding: 1px 6px; border-radius: 4px; letter-spacing: 0.3px; }
  .card-ai-btn {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
    border: 1px solid var(--cp-slate-200, var(--border)); border-radius: 6px;
    background: var(--bg); color: var(--cp-slate-500, #64748b);
    font-size: 11px; font-weight: 500; cursor: pointer; transition: all 150ms; font-family: inherit;
  }
  .card-ai-btn:hover:not(:disabled) { border-color: var(--cp-teal-300, var(--accent)); color: var(--cp-teal-600, var(--accent-strong)); background: var(--accent-soft); }
  .card-ai-btn-primary {
    background: var(--accent); color: white; border-color: var(--accent);
    font-weight: 600;
  }
  .card-ai-btn-primary:hover:not(:disabled) { background: var(--accent-strong); color: white; border-color: var(--accent-strong); }
  .card-ai-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .mini-spinner { display: inline-block; width: 10px; height: 10px; border: 1.5px solid var(--cp-slate-200, var(--border)); border-top-color: var(--cp-teal-500, var(--accent)); border-radius: 50%; animation: spin 0.6s linear infinite; }
</style>
