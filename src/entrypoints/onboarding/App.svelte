<script lang="ts">
  // ── State ──
  let currentStep = $state(0);
  let settings = $state({
    language: 'auto',
    aiProvider: '',
    aiApiKey: '',
    captureDepth: 'standard',
    knowledgeGraphEnabled: true,
  });

  function t(key: string, fallback: string): string {
    return chrome.i18n.getMessage(key) || fallback;
  }

  const steps = ['Welcome', 'Quick Setup', 'Get Started'];

  // ── Navigation ──
  function nextStep() {
    if (currentStep < steps.length - 1) currentStep++;
  }

  function prevStep() {
    if (currentStep > 0) currentStep--;
  }

  async function finish() {
    try {
      const payload: Record<string, any> = {
        language: settings.language,
        captureDepth: settings.captureDepth,
        knowledgeGraphEnabled: settings.knowledgeGraphEnabled,
      };
      if (settings.aiProvider) {
        payload.aiEnabled = true;
        payload.aiProvider = settings.aiProvider;
        if (settings.aiApiKey) {
          payload.aiApiKey = settings.aiApiKey;
        }
      }
      await chrome.runtime.sendMessage({ action: 'saveSettings', data: payload });
    } catch {
      // Settings will use defaults
    }
    window.close();
  }

  function openSidePanel() {
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  }
</script>

<div class="onboarding-bg">
  <div class="onboarding-card">
    <!-- Progress Indicator -->
    <div class="progress-bar">
      {#each steps as step, i}
        <div class="progress-step" class:active={i <= currentStep}>
          <div class="step-dot">{i + 1}</div>
          <span class="step-label">{step}</span>
        </div>
        {#if i < steps.length - 1}
          <div class="step-connector" class:active={i < currentStep}></div>
        {/if}
      {/each}
    </div>

    <!-- Step Content -->
    <div class="step-content">
      <!-- Step 1: Welcome -->
      {#if currentStep === 0}
        <div class="step-welcome">
          <div class="logo-area">
            <img src="/assets/icons/icon-128.png" alt="ContextPrompt AI" class="welcome-logo" />
          </div>
          <h1 class="app-name">ContextPrompt AI</h1>
          <p class="tagline">Your AI Context Operating System</p>

          <div class="features">
            <div class="feature-card">
              <div class="feature-icon">&#x1F578;</div>
              <h3>Knowledge Graph</h3>
              <p>Automatically build a structured knowledge graph from every page you capture. Connect ideas across the web.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">&#x1F9E0;</div>
              <h3>Local AI</h3>
              <p>Integrate with your favourite AI provider to summarise, analyse, and generate prompts from captured context.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">&#x26A1;</div>
              <h3>Smart Capture</h3>
              <p>One-click capture of any web page with intelligent content extraction, tagging, and metadata enrichment.</p>
            </div>
          </div>
        </div>

      <!-- Step 2: Quick Setup -->
      {:else if currentStep === 1}
        <div class="step-setup">
          <h2>{t('quickSetup', 'Quick Setup')}</h2>
          <p class="setup-desc">{t('quickSetupDesc', 'Configure your preferences. You can always change these later in Settings.')}</p>

          <div class="form-section">
            <label class="form-label" for="language-select">Language</label>
            <select id="language-select" class="form-select" bind:value={settings.language}>
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>

          <div class="form-section">
            <label class="form-label" for="provider-select">AI Provider <span class="optional-badge">Optional</span></label>
            <select id="provider-select" class="form-select" bind:value={settings.aiProvider}>
              <option value="">Skip for now</option>
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic</option>
              <option value="qwen">Qwen</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div class="form-section">
            <label class="form-label" for="depth-select">{t('captureDepth', 'Capture Depth')}</label>
            <select id="depth-select" class="form-select" bind:value={settings.captureDepth}>
              <option value="light">{t('depthLight', 'Light')}</option>
              <option value="standard">{t('depthStandard', 'Standard (Recommended)')}</option>
              <option value="deep">{t('depthDeep', 'Deep')}</option>
            </select>
          </div>

          <div class="form-section">
            <label class="form-label">
              <input type="checkbox" bind:checked={settings.knowledgeGraphEnabled} style="margin-right: 8px;" />
              {t('knowledgeGraphTitle', 'Knowledge Graph')}
            </label>
            <p class="form-hint">Build connections between captured pages automatically.</p>
          </div>

          {#if settings.aiProvider}
            <div class="form-section">
              <label class="form-label" for="api-key-input">{t('apiKey', 'API Key')}</label>
              <input
                id="api-key-input"
                type="password"
                class="form-input"
                placeholder="Enter your API key"
                bind:value={settings.aiApiKey}
              />
              <p class="form-hint">Your key is stored locally and never sent to our servers.</p>
            </div>
          {/if}
        </div>

      <!-- Step 3: Get Started -->
      {:else if currentStep === 2}
        <div class="step-getstarted">
          <h2>{t('youreAllSet', "You're All Set!")}</h2>
          <p class="setup-desc">{t('tipsDesc', 'Here are a few tips to get you started.')}</p>

          <div class="tips">
            <div class="tip-card">
              <div class="tip-header">
                <kbd>Ctrl+Shift+C</kbd>
              </div>
              <p>Capture the current page instantly from any tab. The context is saved and ready to use in your prompts.</p>
            </div>
            <div class="tip-card">
              <div class="tip-header">
                <kbd>Ctrl+Shift+P</kbd>
              </div>
              <p>Generate an AI prompt from your captured contexts. Choose a template and get a ready-to-paste prompt.</p>
            </div>
            <div class="tip-card">
              <div class="tip-header">
                <span class="tip-label">Side Panel</span>
              </div>
              <p>
                Access the full interface without leaving your current tab.
                <button class="link-btn" onclick={openSidePanel}>Open Side Panel</button>
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Navigation Buttons -->
    <div class="nav-buttons">
      {#if currentStep > 0}
        <button class="btn btn-secondary" onclick={prevStep}>{t('previous', 'Previous')}</button>
      {:else}
        <div></div>
      {/if}

      {#if currentStep < steps.length - 1}
        <button class="btn btn-primary" onclick={nextStep}>{t('next', 'Next')}</button>
      {:else}
        <button class="btn btn-primary" onclick={finish}>{t('finish', 'Finish')}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* ── Background ── */
  .onboarding-bg {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background:
      linear-gradient(135deg, var(--accent-soft) 0%, var(--cp-slate-100, var(--surface)) 50%, var(--accent-soft) 100%);
  }

  /* ── Card ── */
  .onboarding-card {
    width: 100%;
    max-width: 640px;
    background: var(--bg);
    border-radius: var(--radius-xl, 18px);
    box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
    padding: 40px;
    animation: fadeIn 0.4s var(--ease-default, ease);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Progress Bar ── */
  .progress-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 36px;
  }

  .progress-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .step-dot {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    background: var(--cp-slate-200, #e2e8f0);
    color: var(--cp-slate-500, #64748b);
    transition: all var(--duration-normal, 250ms) var(--ease-default, ease);
  }

  .progress-step.active .step-dot {
    background: var(--accent);
    color: white;
  }

  .step-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--cp-slate-400, #94a3b8);
    transition: color var(--duration-normal, 250ms);
  }

  .progress-step.active .step-label {
    color: var(--accent-strong);
  }

  .step-connector {
    width: 48px;
    height: 2px;
    background: var(--cp-slate-200, #e2e8f0);
    margin: 0 8px;
    margin-bottom: 22px;
    transition: background var(--duration-normal, 250ms);
  }

  .step-connector.active {
    background: var(--cp-teal-400, var(--accent));
  }

  /* ── Step Content ── */
  .step-content {
    min-height: 320px;
  }

  /* Step 1: Welcome */
  .step-welcome {
    text-align: center;
  }

  .logo-area {
    margin-bottom: 16px;
  }

  .welcome-logo {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-lg, 14px);
  }

  .app-name {
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    color: var(--cp-slate-900, #0f172a);
  }

  .tagline {
    font-size: 16px;
    color: var(--cp-teal-600, var(--accent-strong));
    margin: 4px 0 28px;
    font-weight: 500;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    text-align: left;
  }

  .feature-card {
    padding: 16px;
    border-radius: var(--radius-md, 10px);
    background: var(--cp-slate-50, var(--bg));
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    transition: box-shadow var(--duration-fast, 150ms);
  }

  .feature-card:hover {
    box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
  }

  .feature-icon {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .feature-card h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 6px;
    color: var(--cp-slate-800, #1e293b);
  }

  .feature-card p {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
    margin: 0;
    line-height: 1.5;
  }

  /* Step 2: Quick Setup */
  .step-setup h2,
  .step-getstarted h2 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 4px;
    color: var(--cp-slate-900, #0f172a);
    text-align: center;
  }

  .setup-desc {
    text-align: center;
    color: var(--cp-slate-500, #64748b);
    font-size: 14px;
    margin: 0 0 28px;
  }

  .form-section {
    margin-bottom: 20px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--cp-slate-700, #334155);
    margin-bottom: 6px;
  }

  .optional-badge {
    font-size: 10px;
    font-weight: 500;
    background: var(--cp-slate-100, var(--surface));
    color: var(--cp-slate-400, #94a3b8);
    padding: 2px 8px;
    border-radius: var(--radius-full, 9999px);
    margin-left: 6px;
  }

  .form-select,
  .form-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--cp-slate-200, #e2e8f0);
    border-radius: var(--radius-sm, 6px);
    font-size: 14px;
    font-family: var(--cp-font-sans);
    background: var(--bg);
    color: var(--cp-slate-800, #1e293b);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--duration-fast, 150ms);
  }

  .form-select:focus,
  .form-input:focus {
    border-color: var(--cp-teal-400, var(--accent));
    box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.15);
  }

  .form-hint {
    font-size: 11px;
    color: var(--cp-slate-400, #94a3b8);
    margin: 6px 0 0;
  }

  /* Step 3: Get Started */
  .step-getstarted {
    text-align: center;
  }

  .tips {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }

  .tip-card {
    padding: 16px;
    border-radius: var(--radius-md, 10px);
    background: var(--cp-slate-50, var(--bg));
    border: 1px solid var(--cp-slate-200, #e2e8f0);
  }

  .tip-header {
    margin-bottom: 8px;
  }

  .tip-card kbd {
    display: inline-block;
    font-family: var(--cp-font-mono, monospace);
    font-size: 13px;
    font-weight: 600;
    background: var(--accent);
    color: white;
    padding: 4px 12px;
    border-radius: var(--radius-sm, 6px);
  }

  .tip-label {
    display: inline-block;
    font-size: 13px;
    font-weight: 600;
    background: var(--accent-soft);
    color: var(--accent-strong);
    padding: 4px 12px;
    border-radius: var(--radius-sm, 6px);
  }

  .tip-card p {
    font-size: 13px;
    color: var(--cp-slate-600, #475569);
    margin: 0;
    line-height: 1.5;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--cp-teal-600, var(--accent-strong));
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .link-btn:hover {
    color: var(--accent-strong);
  }

  /* ── Navigation Buttons ── */
  .nav-buttons {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid var(--cp-slate-200, #e2e8f0);
  }

  .btn {
    padding: 10px 28px;
    border-radius: var(--radius-sm, 6px);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--cp-font-sans);
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-default, ease);
    border: none;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(13, 148, 136, 0.3);
  }

  .btn-secondary {
    background: var(--cp-slate-100, var(--surface));
    color: var(--cp-slate-600, #475569);
  }

  .btn-secondary:hover {
    background: var(--cp-slate-200, #e2e8f0);
  }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .onboarding-card {
      padding: 24px;
    }

    .features {
      grid-template-columns: 1fr;
    }

    .step-connector {
      width: 24px;
    }
  }
</style>
