<script lang="ts">
  import { onMount } from 'svelte';

  // ── Props ──
  interface Props {
    t?: (key: string, fallback: string) => string;
    localeVersion?: number;
  }
  let { t = (_k: string, fb: string) => fb, localeVersion = 0 }: Props = $props();

  // ── Types ──
  interface MCPToolDef {
    name: string;
    description: string;
    inputSchema?: {
      type: string;
      properties?: Record<string, { type: string; description?: string; default?: unknown }>;
      required?: string[];
    };
  }

  interface ServerStatus {
    enabled: boolean;
    port: number;
    connected: boolean;
    tools: MCPToolDef[];
  }

  interface ClientStatus {
    name: string;
    url: string;
    connected: boolean;
    tools: MCPToolDef[];
  }

  interface MCPServerConfig {
    name: string;
    url: string;
    enabled: boolean;
  }

  interface MCPStatus {
    server: ServerStatus;
    clients: ClientStatus[];
    configuredServers: MCPServerConfig[];
  }

  // ── State ──
  let status = $state<MCPStatus | null>(null);
  let loading = $state(false);
  let activeView = $state<'overview' | 'server' | 'client'>('overview');
  let selectedClient = $state<string | null>(null);
  let selectedTool = $state<MCPToolDef | null>(null);
  let toolSource = $state<'server' | string>('server');
  let toolArgs = $state<Record<string, string>>({});
  let toolResult = $state<string | null>(null);
  let toolRunning = $state(false);
  let notification = $state<{ text: string; type: string } | null>(null);

  // Add server form
  let addName = $state('');
  let addUrl = $state('');
  let showSetupGuide = $state(false);
  let extensionId = $state('');

  function sendMessage(action: string, data?: unknown): Promise<any> {
    return chrome.runtime.sendMessage({ action, data });
  }

  function showNotify(text: string, type = 'success') {
    notification = { text, type };
    setTimeout(() => (notification = null), 3000);
  }

  async function refresh() {
    loading = true;
    try {
      status = await sendMessage('getMCPStatus');
    } catch { /* ignore */ }
    loading = false;
  }

  async function connectServer(name: string, url: string) {
    loading = true;
    const res = await sendMessage('mcpClientConnect', { url, name });
    if (res.success) {
      showNotify(`${t('mcpConnectedTo', 'Connected to')} ${name} — ${res.tools?.length || 0} ${t('mcpTools', 'tools')}`);
    } else {
      showNotify(`${t('mcpFailed', 'Failed')}: ${res.error}`, 'error');
    }
    await refresh();
  }

  async function disconnectServer(name: string) {
    await sendMessage('mcpClientDisconnect', { name });
    showNotify(`${t('mcpDisconnectedFrom', 'Disconnected from')} ${name}`);
    await refresh();
  }

  async function addServer() {
    if (!addUrl.trim()) return;
    const serverName = addName || addUrl;
    const serverUrl = addUrl;
    const settings = await sendMessage('getSettings');
    const servers = settings.mcpServers || [];
    servers.push({ name: serverName, url: serverUrl, enabled: true });
    await sendMessage('saveSettings', { mcpServers: servers });
    addName = '';
    addUrl = '';
    // Auto-connect
    await sendMessage('mcpClientConnect', { url: serverUrl, name: serverName });
    await refresh();
  }

  async function removeServer(name: string) {
    await sendMessage('mcpClientDisconnect', { name });
    const settings = await sendMessage('getSettings');
    const servers = (settings.mcpServers || []).filter((s: MCPServerConfig) => s.name !== name);
    await sendMessage('saveSettings', { mcpServers: servers });
    await refresh();
  }

  function openTool(tool: MCPToolDef, source: 'server' | string) {
    selectedTool = tool;
    toolSource = source;
    toolArgs = {};
    toolResult = null;
    // Pre-fill defaults
    if (tool.inputSchema?.properties) {
      for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
        if (prop.default !== undefined) toolArgs[key] = String(prop.default);
      }
    }
  }

  function closeTool() {
    selectedTool = null;
    toolResult = null;
    toolArgs = {};
  }

  async function runTool() {
    if (!selectedTool) return;
    toolRunning = true;
    toolResult = null;

    // Parse args to proper types
    const parsedArgs: Record<string, unknown> = {};
    if (selectedTool.inputSchema?.properties) {
      for (const [key, prop] of Object.entries(selectedTool.inputSchema.properties)) {
        const val = toolArgs[key];
        if (val === undefined || val === '') continue;
        if (prop.type === 'number') parsedArgs[key] = Number(val);
        else if (prop.type === 'boolean') parsedArgs[key] = val === 'true';
        else parsedArgs[key] = val;
      }
    }

    try {
      if (toolSource === 'server') {
        // Call our own MCP server tool via background handler
        const res = await sendMessage('mcpClientCallTool', {
          name: '__self__',
          tool: selectedTool.name,
          args: parsedArgs,
        });
        // For self-tools, call directly via background
        const directRes = await sendMessage(
          selectedTool.name === 'search_knowledge' ? 'searchKnowledge' :
          selectedTool.name === 'get_context' ? 'assembleContext' :
          selectedTool.name === 'list_knowledge' ? 'getAllKnowledgeNodes' :
          selectedTool.name === 'get_stats' ? 'getKnowledgeStats' :
          selectedTool.name === 'capture_page' ? 'captureSelection' :
          selectedTool.name === 'screenshot' ? 'mcpScreenshot' :
          selectedTool.name === 'extract_images' ? 'mcpExtractImages' :
          selectedTool.name === 'capture_page_with_images' ? 'mcpCapturePageWithImages' :
          'getMCPStatus',
          parsedArgs,
        );
        toolResult = JSON.stringify(directRes, null, 2);
      } else {
        const res = await sendMessage('mcpClientCallTool', {
          name: toolSource,
          tool: selectedTool.name,
          args: parsedArgs,
        });
        if (res.success) {
          toolResult = JSON.stringify(res.result, null, 2);
        } else {
          toolResult = `Error: ${res.error}`;
        }
      }
    } catch (err) {
      toolResult = `Error: ${(err as Error).message}`;
    }
    toolRunning = false;
  }

  async function connectAll() {
    loading = true;
    await sendMessage('mcpAutoConnect');
    await refresh();
  }

  onMount(() => {
    extensionId = chrome.runtime.id || '';
    refresh();
  });
</script>

<!-- locale reactivity anchor -->
{#key localeVersion}
<!-- Notification -->
{#if notification}
  <div class="mcp-toast" class:mcp-toast-err={notification.type === 'error'}>{notification.text}</div>
{/if}

<div class="mcp">
  {#if selectedTool}
    <!-- Tool Runner -->
    <div class="mcp-tool-runner">
      <div class="mcp-tool-head">
        <button class="mcp-back" onclick={closeTool}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.5L3 6l5 4.5"/></svg>
          {t('back', 'Back')}
        </button>
        <span class="mcp-tool-source">{toolSource === 'server' ? t('mcpLocalServer', 'Local Server') : toolSource}</span>
      </div>
      <h3 class="mcp-tool-name">{selectedTool.name}</h3>
      <p class="mcp-tool-desc">{selectedTool.description}</p>

      {#if selectedTool.inputSchema?.properties && Object.keys(selectedTool.inputSchema.properties).length > 0}
        <div class="mcp-tool-params">
          <span class="mcp-label">{t('mcpParameters', 'Parameters')}</span>
          {#each Object.entries(selectedTool.inputSchema.properties) as [key, prop]}
            <div class="mcp-param">
              <label class="mcp-param-label">
                {key}
                {#if selectedTool.inputSchema?.required?.includes(key)}<span class="mcp-required">*</span>{/if}
                <span class="mcp-param-type">{prop.type}</span>
              </label>
              {#if prop.description}
                <span class="mcp-param-hint">{prop.description}</span>
              {/if}
              <input
                class="mcp-param-input"
                type={prop.type === 'number' ? 'number' : 'text'}
                placeholder={prop.default !== undefined ? `Default: ${prop.default}` : ''}
                bind:value={toolArgs[key]}
              />
            </div>
          {/each}
        </div>
      {/if}

      <button class="mcp-run-btn" onclick={runTool} disabled={toolRunning}>
        {#if toolRunning}
          <span class="mcp-spinner"></span> {t('mcpRunning', 'Running...')}
        {:else}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9-5.5L3 1.5z"/></svg>
          {t('mcpRunTool', 'Run Tool')}
        {/if}
      </button>

      {#if toolResult}
        <div class="mcp-result">
          <div class="mcp-result-head">
            <span>{t('mcpResult', 'Result')}</span>
            <button class="mcp-copy" onclick={async () => { await navigator.clipboard.writeText(toolResult!); showNotify(t('mcpCopied', 'Copied')); }}>{t('mcpCopy', 'Copy')}</button>
          </div>
          <pre class="mcp-result-pre">{toolResult}</pre>
        </div>
      {/if}
    </div>

  {:else}
    <!-- Main View -->
    <div class="mcp-header">
      <h3>{t('mcpProtocol', 'MCP Protocol')}</h3>
      <button class="mcp-refresh" onclick={refresh} disabled={loading} title={t('mcpRefresh', 'Refresh status')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class:mcp-spin={loading}>
          <path d="M1.5 7a5.5 5.5 0 019.5-3.5M12.5 7a5.5 5.5 0 01-9.5 3.5"/>
          <path d="M11 1v3h-3M3 10v3h3" fill="none"/>
        </svg>
      </button>
    </div>

    {#if !status}
      <div class="mcp-loading">{t('mcpLoading', 'Loading MCP status...')}</div>
    {:else}
      <!-- Server Section -->
      <section class="mcp-section">
        <div class="mcp-section-head">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <rect x="2" y="2" width="10" height="4" rx="1.5"/><rect x="2" y="8" width="10" height="4" rx="1.5"/>
            <circle cx="4.5" cy="4" r="0.8" fill="currentColor"/><circle cx="4.5" cy="10" r="0.8" fill="currentColor"/>
          </svg>
          <span>{t('mcpServer', 'MCP Server')}</span>
          <span class="mcp-badge" class:mcp-badge-on={status.server.enabled && status.server.connected} class:mcp-badge-off={!status.server.enabled}>
            {status.server.enabled ? (status.server.connected ? t('mcpConnected', 'Connected') : t('mcpEnabled', 'Enabled')) : t('mcpOff', 'Off')}
          </span>
        </div>
        {#if status.server.enabled}
          <div class="mcp-server-info">
            <span class="mcp-info-label">{t('mcpEndpoint', 'Endpoint')}</span>
            <code class="mcp-info-value">http://127.0.0.1:{status.server.port}</code>
          </div>
          <div class="mcp-server-info">
            <span class="mcp-info-label">{t('mcpToolsExposed', 'Tools exposed')}</span>
            <span class="mcp-info-value">{status.server.tools.length}</span>
          </div>

          <!-- Setup Guide (shown when enabled but native host not connected) -->
          {#if !status.server.connected}
            <div class="mcp-guide-banner">
              <div class="mcp-guide-banner-head">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round">
                  <circle cx="7" cy="7" r="6"/><path d="M7 4v3"/><circle cx="7" cy="9.5" r="0.5" fill="#f59e0b"/>
                </svg>
                <span>{t('mcpNativeNotConnected', 'Native Host not connected')}</span>
              </div>
              <p class="mcp-guide-banner-text">{t('mcpNativeRequired', 'Install the Native Messaging Host to expose tools to Claude Desktop, Cursor, etc.')}</p>
              <button class="mcp-btn-sm mcp-btn-outline" onclick={() => (showSetupGuide = !showSetupGuide)}>
                {showSetupGuide ? t('mcpHideGuide', 'Hide Guide') : t('mcpSetupGuide', 'Setup Guide')}
              </button>
            </div>
          {/if}

          {#if showSetupGuide}
            <div class="mcp-guide">
              <div class="mcp-guide-step">
                <span class="mcp-guide-num">1</span>
                <div class="mcp-guide-body">
                  <span class="mcp-guide-title">{t('mcpGuideStep1', 'Install Node.js')}</span>
                  <span class="mcp-guide-desc">{t('mcpGuideStep1Desc', 'Ensure node is available in your PATH.')}</span>
                </div>
              </div>
              <div class="mcp-guide-step">
                <span class="mcp-guide-num">2</span>
                <div class="mcp-guide-body">
                  <span class="mcp-guide-title">{t('mcpGuideStep2', 'Run the install script')}</span>
                  <span class="mcp-guide-desc">{t('mcpGuideStep2Desc', 'Open a terminal in the native-host folder and run:')}</span>
                  <code class="mcp-guide-code">
                    {navigator.platform?.startsWith('Win')
                      ? `install.bat`
                      : `./install.sh`}
                  </code>
                  <span class="mcp-guide-desc">{t('mcpGuideStep2Input', 'When prompted, enter your Extension ID:')}</span>
                  <div class="mcp-guide-id-row">
                    <code class="mcp-guide-code mcp-guide-id">{extensionId || '...'}</code>
                    {#if extensionId}
                      <button class="mcp-btn-sm mcp-btn-outline" onclick={async () => { await navigator.clipboard.writeText(extensionId); showNotify(t('mcpCopied', 'Copied')); }}>
                        {t('mcpCopy', 'Copy')}
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
              <div class="mcp-guide-step">
                <span class="mcp-guide-num">3</span>
                <div class="mcp-guide-body">
                  <span class="mcp-guide-title">{t('mcpGuideStep3', 'Restart Chrome')}</span>
                  <span class="mcp-guide-desc">{t('mcpGuideStep3Desc', 'Close and reopen Chrome for the native host registration to take effect.')}</span>
                </div>
              </div>
              <div class="mcp-guide-step">
                <span class="mcp-guide-num">4</span>
                <div class="mcp-guide-body">
                  <span class="mcp-guide-title">{t('mcpGuideStep4', 'Configure Claude Desktop / Cursor')}</span>
                  <span class="mcp-guide-desc">{t('mcpGuideStep4Desc', 'Add this URL as an MCP server in your AI tool:')}</span>
                  <div class="mcp-guide-id-row">
                    <code class="mcp-guide-code mcp-guide-id">http://127.0.0.1:{status.server.port}</code>
                    <button class="mcp-btn-sm mcp-btn-outline" onclick={async () => { await navigator.clipboard.writeText(`http://127.0.0.1:${status!.server.port}`); showNotify(t('mcpCopied', 'Copied')); }}>
                      {t('mcpCopy', 'Copy')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <div class="mcp-tool-list">
            {#each status.server.tools as tool}
              <button class="mcp-tool-card" onclick={() => openTool(tool, 'server')}>
                <span class="mcp-tool-card-name">{tool.name}</span>
                <span class="mcp-tool-card-desc">{tool.description}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="mcp-hint">{t('mcpEnableHint', 'Enable MCP Server in Settings to expose tools to Claude Desktop, Cursor, etc.')}</p>
        {/if}
      </section>

      <!-- Clients Section -->
      <section class="mcp-section">
        <div class="mcp-section-head">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <path d="M7 2v4l3 2"/><circle cx="7" cy="7" r="5.5"/>
          </svg>
          <span>{t('mcpExternalServers', 'External Servers')}</span>
          {#if status.clients.length > 0}
            <span class="mcp-badge mcp-badge-on">{status.clients.filter(c => c.connected).length} {t('mcpConnectedCount', 'connected')}</span>
          {/if}
        </div>

        {#if status.configuredServers.length > 0}
          <div class="mcp-client-list">
            {#each status.configuredServers as server}
              {@const client = status.clients.find(c => c.name === server.name)}
              <div class="mcp-client-card">
                <div class="mcp-client-head">
                  <span class="mcp-dot" class:mcp-dot-on={client?.connected}></span>
                  <span class="mcp-client-name">{server.name}</span>
                  <div class="mcp-client-actions">
                    {#if client?.connected}
                      <button class="mcp-btn-sm mcp-btn-outline" onclick={() => disconnectServer(server.name)}>{t('mcpDisconnect', 'Disconnect')}</button>
                    {:else}
                      <button class="mcp-btn-sm mcp-btn-primary" onclick={() => connectServer(server.name, server.url)}>{t('mcpConnect', 'Connect')}</button>
                    {/if}
                    <button class="mcp-btn-icon" onclick={() => removeServer(server.name)} title={t('mcpRemove', 'Remove')}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                        <line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <code class="mcp-client-url">{server.url}</code>
                {#if client?.connected && client.tools.length > 0}
                  <div class="mcp-tool-list">
                    {#each client.tools as tool}
                      <button class="mcp-tool-card" onclick={() => openTool(tool, server.name)}>
                        <span class="mcp-tool-card-name">{tool.name}</span>
                        <span class="mcp-tool-card-desc">{tool.description}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          <button class="mcp-btn-sm mcp-btn-outline" style="margin-top:8px;" onclick={connectAll}>{t('mcpConnectAll', 'Connect All')}</button>
        {:else}
          <p class="mcp-hint">{t('mcpNoServers', 'No external MCP servers configured.')}</p>
        {/if}

        <!-- Add Server -->
        <div class="mcp-add">
          <span class="mcp-label">{t('mcpAddServer', 'Add Server')}</span>
          <div class="mcp-add-row">
            <input class="mcp-input" type="text" placeholder={t('mcpName', 'Name')} bind:value={addName} style="flex:1;" />
            <input class="mcp-input" type="text" placeholder="http://127.0.0.1:8080" bind:value={addUrl} style="flex:2;" />
            <button class="mcp-btn-sm mcp-btn-primary" onclick={addServer}>{t('mcpAdd', 'Add')}</button>
          </div>
        </div>
      </section>
    {/if}
  {/if}
</div>
{/key}

<style>
  .mcp { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

  /* Header */
  .mcp-header { display: flex; align-items: center; justify-content: space-between; }
  .mcp-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary, #1a1a2e); }
  .mcp-refresh {
    background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px;
    color: var(--text-secondary, #64748b); transition: all 0.2s;
  }
  .mcp-refresh:hover { background: var(--bg-hover, rgba(0,0,0,0.05)); color: var(--text-primary, #1a1a2e); }
  .mcp-refresh:disabled { opacity: 0.5; cursor: default; }

  /* Loading */
  .mcp-loading { text-align: center; padding: 24px; color: var(--text-secondary, #64748b); font-size: 12px; }

  /* Sections */
  .mcp-section { display: flex; flex-direction: column; gap: 8px; }
  .mcp-section-head {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600; color: var(--text-secondary, #64748b);
    text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* Badges */
  .mcp-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 500;
    background: var(--bg-muted, #f1f5f9); color: var(--text-secondary, #64748b);
  }
  .mcp-badge-on { background: #dcfce7; color: #16a34a; }
  .mcp-badge-off { background: #fef2f2; color: #dc2626; }

  /* Server info */
  .mcp-server-info {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 0; font-size: 12px;
  }
  .mcp-info-label { color: var(--text-secondary, #64748b); }
  .mcp-info-value {
    color: var(--text-primary, #1a1a2e); font-size: 11px;
    background: var(--bg-muted, #f1f5f9); padding: 2px 6px; border-radius: 4px;
  }

  /* Tool list */
  .mcp-tool-list { display: flex; flex-direction: column; gap: 4px; }
  .mcp-tool-card {
    display: flex; flex-direction: column; gap: 2px; padding: 8px 10px;
    background: var(--bg-card, #fff); border: 1px solid var(--border, #e2e8f0);
    border-radius: 8px; cursor: pointer; text-align: left; transition: all 0.15s;
  }
  .mcp-tool-card:hover { border-color: var(--accent, #6366f1); background: var(--bg-hover, #f8fafc); }
  .mcp-tool-card-name { font-size: 12px; font-weight: 600; color: var(--text-primary, #1a1a2e); }
  .mcp-tool-card-desc { font-size: 11px; color: var(--text-secondary, #64748b); line-height: 1.3; }

  /* Client list */
  .mcp-client-list { display: flex; flex-direction: column; gap: 6px; }
  .mcp-client-card {
    padding: 10px; border: 1px solid var(--border, #e2e8f0);
    border-radius: 8px; background: var(--bg-card, #fff);
    display: flex; flex-direction: column; gap: 6px;
  }
  .mcp-client-head { display: flex; align-items: center; gap: 6px; }
  .mcp-client-name { font-size: 12px; font-weight: 600; color: var(--text-primary, #1a1a2e); flex: 1; }
  .mcp-client-url { font-size: 10px; color: var(--text-secondary, #64748b); word-break: break-all; }
  .mcp-client-actions { display: flex; gap: 4px; align-items: center; }

  /* Dot indicator */
  .mcp-dot { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; flex-shrink: 0; }
  .mcp-dot-on { background: #22c55e; box-shadow: 0 0 4px rgba(34,197,94,0.4); }

  /* Buttons */
  .mcp-btn-sm {
    font-size: 11px; padding: 3px 10px; border-radius: 6px; border: none;
    cursor: pointer; font-weight: 500; transition: all 0.15s;
  }
  .mcp-btn-primary { background: var(--accent, #6366f1); color: #fff; }
  .mcp-btn-primary:hover { opacity: 0.9; }
  .mcp-btn-outline {
    background: transparent; border: 1px solid var(--border, #e2e8f0);
    color: var(--text-secondary, #64748b);
  }
  .mcp-btn-outline:hover { border-color: var(--accent, #6366f1); color: var(--accent, #6366f1); }
  .mcp-btn-icon {
    background: none; border: none; cursor: pointer; padding: 2px;
    color: var(--text-secondary, #64748b); border-radius: 4px;
  }
  .mcp-btn-icon:hover { color: #dc2626; background: #fef2f2; }

  /* Add server form */
  .mcp-add { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .mcp-add-row { display: flex; gap: 6px; align-items: center; }
  .mcp-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, #64748b); text-transform: uppercase; letter-spacing: 0.3px; }
  .mcp-input {
    font-size: 12px; padding: 5px 8px; border: 1px solid var(--border, #e2e8f0);
    border-radius: 6px; background: var(--bg-input, #fff); color: var(--text-primary, #1a1a2e);
    outline: none; transition: border-color 0.15s;
  }
  .mcp-input:focus { border-color: var(--accent, #6366f1); }
  .mcp-hint { font-size: 11px; color: var(--text-secondary, #94a3b8); margin: 0; line-height: 1.4; }

  /* Tool Runner */
  .mcp-tool-runner { display: flex; flex-direction: column; gap: 10px; }
  .mcp-tool-head { display: flex; align-items: center; gap: 8px; }
  .mcp-back {
    display: flex; align-items: center; gap: 4px; font-size: 12px;
    background: none; border: none; cursor: pointer; padding: 4px 8px;
    border-radius: 6px; color: var(--text-secondary, #64748b); transition: all 0.15s;
  }
  .mcp-back:hover { background: var(--bg-hover, #f1f5f9); color: var(--text-primary, #1a1a2e); }
  .mcp-tool-source { font-size: 10px; color: var(--accent, #6366f1); background: var(--bg-muted, #f1f5f9); padding: 2px 8px; border-radius: 8px; }
  .mcp-tool-name { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-primary, #1a1a2e); }
  .mcp-tool-desc { margin: 0; font-size: 12px; color: var(--text-secondary, #64748b); line-height: 1.4; }

  /* Tool params */
  .mcp-tool-params { display: flex; flex-direction: column; gap: 8px; }
  .mcp-param { display: flex; flex-direction: column; gap: 3px; }
  .mcp-param-label { font-size: 12px; font-weight: 500; color: var(--text-primary, #1a1a2e); display: flex; align-items: center; gap: 4px; }
  .mcp-required { color: #dc2626; font-size: 11px; }
  .mcp-param-type { font-size: 10px; color: var(--accent, #6366f1); background: var(--bg-muted, #f1f5f9); padding: 0 4px; border-radius: 3px; }
  .mcp-param-hint { font-size: 10px; color: var(--text-secondary, #94a3b8); }
  .mcp-param-input {
    font-size: 12px; padding: 6px 8px; border: 1px solid var(--border, #e2e8f0);
    border-radius: 6px; background: var(--bg-input, #fff); color: var(--text-primary, #1a1a2e);
    outline: none; transition: border-color 0.15s;
  }
  .mcp-param-input:focus { border-color: var(--accent, #6366f1); }

  /* Run button */
  .mcp-run-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 600; background: var(--accent, #6366f1); color: #fff;
    transition: all 0.15s;
  }
  .mcp-run-btn:hover:not(:disabled) { opacity: 0.9; }
  .mcp-run-btn:disabled { opacity: 0.6; cursor: default; }

  /* Result */
  .mcp-result {
    border: 1px solid var(--border, #e2e8f0); border-radius: 8px;
    overflow: hidden; background: var(--bg-card, #fff);
  }
  .mcp-result-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px; background: var(--bg-muted, #f8fafc);
    border-bottom: 1px solid var(--border, #e2e8f0);
    font-size: 11px; font-weight: 600; color: var(--text-secondary, #64748b);
  }
  .mcp-copy {
    font-size: 10px; background: none; border: 1px solid var(--border, #e2e8f0);
    border-radius: 4px; padding: 2px 8px; cursor: pointer;
    color: var(--text-secondary, #64748b); transition: all 0.15s;
  }
  .mcp-copy:hover { border-color: var(--accent, #6366f1); color: var(--accent, #6366f1); }
  .mcp-result-pre {
    margin: 0; padding: 10px; font-size: 11px; line-height: 1.5;
    overflow-x: auto; max-height: 300px; overflow-y: auto;
    color: var(--text-primary, #1a1a2e); white-space: pre-wrap; word-break: break-word;
  }

  /* Toast */
  .mcp-toast {
    position: fixed; top: 12px; right: 12px; z-index: 999;
    padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 500;
    background: #dcfce7; color: #16a34a; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    animation: mcp-slide-in 0.2s ease-out;
  }
  .mcp-toast-err { background: #fef2f2; color: #dc2626; }

  /* Spinner */
  .mcp-spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: mcp-spin 0.6s linear infinite;
  }
  .mcp-spin { animation: mcp-spin 0.8s linear infinite; }

  @keyframes mcp-spin { to { transform: rotate(360deg); } }
  @keyframes mcp-slide-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* Setup Guide Banner */
  .mcp-guide-banner {
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px 12px; border-radius: 8px;
    background: #fffbeb; border: 1px solid #fde68a;
  }
  .mcp-guide-banner-head {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600; color: #92400e;
  }
  .mcp-guide-banner-text { margin: 0; font-size: 11px; color: #a16207; line-height: 1.4; }

  /* Setup Guide Steps */
  .mcp-guide {
    display: flex; flex-direction: column; gap: 2px;
    padding: 10px; border: 1px solid var(--border, #e2e8f0);
    border-radius: 8px; background: var(--bg-card, #fff);
  }
  .mcp-guide-step {
    display: flex; gap: 10px; padding: 8px 0;
    border-bottom: 1px solid var(--border, #f1f5f9);
  }
  .mcp-guide-step:last-child { border-bottom: none; }
  .mcp-guide-num {
    flex-shrink: 0; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: var(--accent, #6366f1); color: #fff;
    font-size: 11px; font-weight: 700;
  }
  .mcp-guide-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .mcp-guide-title { font-size: 12px; font-weight: 600; color: var(--text-primary, #1a1a2e); }
  .mcp-guide-desc { font-size: 11px; color: var(--text-secondary, #64748b); line-height: 1.4; }
  .mcp-guide-code {
    display: block; padding: 5px 8px; border-radius: 6px; font-size: 11px;
    background: var(--bg-muted, #f1f5f9); color: var(--text-primary, #1a1a2e);
    word-break: break-all; font-family: monospace;
  }
  .mcp-guide-id-row { display: flex; align-items: center; gap: 6px; }
  .mcp-guide-id { flex: 1; }
</style>