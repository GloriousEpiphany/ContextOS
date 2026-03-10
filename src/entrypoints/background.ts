/**
 * ContextPrompt AI v4.0 — Background Service Worker
 * Central message hub, state management, and AI orchestration.
 * Migrated from service-worker.js with TypeScript + Dexie.js.
 */

export default defineBackground(() => {
  const MAX_CONTEXTS = 50;
  const MAX_HISTORY = 100;

  // Lazy imports — loaded when first needed to keep cold start fast
  let _aiRouter: import('../lib/ai/router').AIRouter | null = null;

  async function getAIRouter() {
    if (!_aiRouter) {
      const { AIRouter } = await import('../lib/ai/router');
      _aiRouter = new AIRouter();
      const settings = await getSettings();
      _aiRouter.updateCloudSettings(settings);
    }
    return _aiRouter;
  }

  // ==================== Installation ====================

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'update') {
      await migrateFromV3();
    }
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
    }
    setupContextMenus();
    await updateBadge();
    try {
      await chrome.sidePanel.setOptions({ enabled: true, path: 'sidepanel.html' });
    } catch { /* sidePanel API may not be available */ }
  });

  // Allow opening side panel via action click (fallback)
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  } catch { /* ignore */ }

  // ==================== Context Menus ====================

  function setupContextMenus() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'capture-page',
        title: chrome.i18n.getMessage('capturePageMenu') || 'Capture this page',
        contexts: ['page'],
      });
      chrome.contextMenus.create({
        id: 'capture-selection',
        title: chrome.i18n.getMessage('captureSelectionMenu') || 'Capture selected text',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: 'capture-link',
        title: chrome.i18n.getMessage('captureLinkMenu') || 'Capture link',
        contexts: ['link'],
      });
      chrome.contextMenus.create({
        id: 'capture-to-knowledge',
        title: 'Save to Knowledge Graph',
        contexts: ['selection'],
      });
    });
  }

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab) return;
    try {
      if (info.menuItemId === 'capture-page') {
        await captureFromTab(tab);
      } else if (info.menuItemId === 'capture-selection') {
        await saveContext({
          title: tab.title || 'Selection',
          url: tab.url || '',
          selection: info.selectionText || '',
          description: info.selectionText || '',
        });
      } else if (info.menuItemId === 'capture-link') {
        await saveContext({
          title: info.linkUrl || 'Link',
          url: info.linkUrl || '',
          description: `Link from: ${tab.title}`,
        });
      } else if (info.menuItemId === 'capture-to-knowledge') {
        // Directly add selection to knowledge graph, skipping context middle layer
        const kg = await getKnowledgeGraph();
        await kg.addFromContext({
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          title: tab.title || 'Selection',
          url: tab.url || '',
          selection: info.selectionText || '',
          description: info.selectionText?.substring(0, 200) || '',
          mainContent: info.selectionText || '',
          ogData: {},
          structuredData: {},
          chatContent: '',
          isPrivateLink: false,
          platformName: '',
          captureDepth: 'standard' as const,
          notes: '',
          tags: [],
          aiSummary: '',
        });
        try {
          await chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('/assets/icons/icon-48.png'),
            title: 'ContextPrompt AI',
            message: 'Saved to Knowledge Graph',
          });
        } catch { /* notifications may not be available */ }
      }
    } catch { /* ignore */ }
  });

  // ==================== Keyboard Shortcuts ====================

  chrome.commands.onCommand.addListener(async (command) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      if (command === 'capture-page') {
        await captureFromTab(tab);
      } else if (command === 'generate-prompt') {
        await chrome.tabs.sendMessage(tab.id, { action: 'triggerCraftPrompt' });
      }
    } catch { /* ignore */ }
  });

  async function captureFromTab(tab: chrome.tabs.Tab) {
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) return;
    try {
      const settings = await getSettings();
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/capture.js'],
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'captureContext',
        options: { captureDepth: settings.captureDepth || 'standard' },
      });
      if (response?.success) {
        await saveContext(response.context);
      }
    } catch { /* ignore */ }
  }

  // ==================== Auto Capture ====================

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    try {
      const settings = await getSettings();
      if (!settings.autoCapture || !settings.autoCapturePatterns) return;
      const patterns = settings.autoCapturePatterns.split('\n').map((p: string) => p.trim()).filter(Boolean);
      const matches = patterns.some((pattern: string) => {
        try {
          return new RegExp(pattern.replace(/\*/g, '.*')).test(tab.url!);
        } catch { return false; }
      });
      if (matches) {
        await captureFromTab(tab);
        try {
          await chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('/assets/icons/icon-48.png'),
            title: 'ContextPrompt AI',
            message: `Auto-captured: ${tab.title}`,
          });
        } catch { /* notifications may not be available */ }
      }
    } catch { /* ignore */ }
  });

  // ==================== Batch Capture ====================

  async function captureBatchTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const results: { url: string; success: boolean }[] = [];

    for (const tab of tabs) {
      if (!tab.id || !tab.url || tab.url.startsWith('chrome://')) continue;
      try {
        await captureFromTab(tab);
        results.push({ url: tab.url, success: true });
      } catch {
        results.push({ url: tab.url, success: false });
      }
    }

    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('/assets/icons/icon-48.png'),
        title: 'ContextPrompt AI',
        message: `Batch captured ${results.filter((r) => r.success).length}/${results.length} tabs`,
      });
    } catch { /* ignore */ }

    return { success: true, results };
  }

  // ==================== Message Handler ====================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: (err as Error).message });
    });
    return true; // async response
  });

  async function handleMessage(message: { action: string; data?: any }, _sender: chrome.runtime.MessageSender) {
    const { action, data } = message;

    try {
      switch (action) {
        // Context CRUD
        case 'saveContext': return await saveContext(data);
        case 'getLatestContext': return await getLatestContext();
        case 'getAllContexts': return await getAllContexts();
        case 'deleteContext': return await deleteContext(data.id);
        case 'clearAllContexts': return await clearAllContexts();
        case 'updateContext': return await updateContext(data);

        // Settings
        case 'getSettings': return await getSettings();
        case 'saveSettings': return await saveSettings(data);

        // Templates
        case 'getTemplates': return await getTemplates();
        case 'saveTemplate': return await saveTemplate(data);
        case 'deleteTemplate': return await deleteTemplate(data.id);

        // AI
        case 'summarizeWithAI': return await summarizeWithAI(data);
        case 'summarizeContext': return await manualSummarizeContext(data.id);
        case 'analyzePromptQuality': return await analyzePromptQuality(data);
        case 'fuseContexts': return await fuseContextsAction(data);
        case 'testAIConnection': return await testAIConnection();
        case 'localSummarize': {
          const { createContextSummary } = await import('../lib/nlp-engine');
          return { success: true, summary: createContextSummary(data) };
        }

        // Prompt History
        case 'savePromptHistory': return await savePromptHistory(data);
        case 'getPromptHistory': return await getPromptHistory();
        case 'clearPromptHistory': return await clearPromptHistory();

        // Favorites
        case 'toggleFavorite': return await toggleFavorite(data.id);
        case 'getFavorites': return await getFavorites();

        // Export/Import
        case 'exportData': return await exportData();
        case 'importData': return await importData(data);

        // Tags
        case 'suggestTags': return await suggestTags(data);

        // Side Panel
        case 'openSidePanel':
          try {
            // Ensure side panel options are set before opening
            await chrome.sidePanel.setOptions({ enabled: true, path: 'sidepanel.html' });
            const [spTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (spTab?.windowId) {
              await chrome.sidePanel.open({ windowId: spTab.windowId });
            }
            return { success: true };
          } catch (e) {
            return { success: false, error: (e as Error).message };
          }

        // v4: Knowledge Graph
        case 'searchKnowledge': return await searchKnowledge(data);
        case 'addToKnowledge': return await addToKnowledge(data);
        case 'getRelatedNodes': return await getRelatedNodesAction(data);
        case 'getKnowledgeGraphData': return await getKnowledgeGraphData();
        case 'getKnowledgeStats': return await getKnowledgeStats();

        // v4 Phase 3: Capture & Orchestration
        case 'captureSelection':
        case 'captureToKnowledge': {
          const kg = await getKnowledgeGraph();
          const node = await kg.addFromContext({
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            title: data.title || 'Selection',
            url: data.url || '',
            selection: data.selection || '',
            description: data.description || '',
            mainContent: data.mainContent || data.selection || '',
            ogData: data.ogData || {},
            structuredData: data.structuredData || {},
            chatContent: data.chatContent || '',
            isPrivateLink: false,
            platformName: '',
            captureDepth: 'standard' as const,
            notes: '',
            tags: data.tags || [],
            aiSummary: '',
          });
          return { success: true, node };
        }

        case 'summarizeSelection': {
          const router = await getAIRouter();
          const { detectLanguage } = await import('../lib/nlp-engine');
          const content = data.content || '';
          const lang = detectLanguage(content);
          const { result } = await router.summarize(content, { language: lang, maxLength: 300 });
          return { success: true, summary: result };
        }

        case 'translateSelection': {
          const router = await getAIRouter();
          const { detectLanguage: detect } = await import('../lib/nlp-engine');
          const text = data.content || '';
          const sourceLang = detect(text);
          const targetLang = sourceLang === 'zh' ? 'English' : '中文';
          try {
            const { result: translated } = await router.summarize(
              `Translate the following text to ${targetLang}:\n\n${text}`,
              { language: sourceLang === 'zh' ? 'en' : 'zh', maxLength: text.length * 2 },
            );
            return { success: true, result: translated };
          } catch (err) {
            return { success: false, error: (err as Error).message };
          }
        }

        case 'captureBatchTabs': return await captureBatchTabs();

        case 'assembleContext': {
          const { contextOrchestrator } = await import('../lib/context/orchestrator');
          const pkg = await contextOrchestrator.assembleContext(
            data.query || '',
            { model: data.model || 'gpt-4o', currentPage: data.currentPage || null },
          );
          return { success: true, ...pkg };
        }

        // v4 Phase 4: Workflows
        case 'getWorkflows': return await getWorkflowsAction();
        case 'saveWorkflow': return await saveWorkflowAction(data);
        case 'deleteWorkflow': return await deleteWorkflowAction(data.id);
        case 'executeWorkflow': return await executeWorkflowAction(data);

        // v4: Offscreen embedding
        case 'computeEmbedding': {
          // Forward to offscreen document if available, otherwise compute directly
          try {
            await ensureOffscreenDocument();
            return await chrome.runtime.sendMessage({
              action: 'computeEmbedding',
              data: { text: data.text },
            });
          } catch {
            const { generateEmbedding } = await import('../lib/ai/embeddings');
            const vector = await generateEmbedding(data.text || '');
            return { success: true, vector: Array.from(vector) };
          }
        }

        default: return { success: false, error: 'Unknown action' };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ==================== Storage Helpers (chrome.storage for backward compat) ====================

  function getStorageData(key: string, storageType: 'local' | 'session' = 'local'): Promise<any> {
    return new Promise((resolve, reject) => {
      const storage = storageType === 'session' ? chrome.storage.session : chrome.storage.local;
      storage.get([key], (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result[key]);
      });
    });
  }

  function setStorageData(key: string, value: any, storageType: 'local' | 'session' = 'local'): Promise<void> {
    return new Promise((resolve, reject) => {
      const storage = storageType === 'session' ? chrome.storage.session : chrome.storage.local;
      storage.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  // ==================== Context Management ====================

  async function saveContext(contextData: any) {
    try {
      const contexts = (await getStorageData('contexts')) || [];
      const newContext = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        title: contextData.title || 'Untitled',
        url: contextData.url || '',
        selection: contextData.selection || '',
        description: contextData.description || '',
        ogData: contextData.ogData || {},
        structuredData: contextData.structuredData || {},
        mainContent: contextData.mainContent || '',
        chatContent: contextData.chatContent || '',
        isPrivateLink: contextData.isPrivateLink || false,
        platformName: contextData.platformName || '',
        captureDepth: contextData.captureDepth || 'standard',
        notes: contextData.notes || '',
        tags: contextData.tags || [],
        aiSummary: '',
      };
      contexts.unshift(newContext);
      if (contexts.length > MAX_CONTEXTS) contexts.pop();
      await setStorageData('contexts', contexts);
      await updateBadge();

      // Auto AI summarization (non-blocking)
      autoSummarizeContext(newContext.id).catch(() => {});

      return { success: true, context: newContext };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function autoSummarizeContext(contextId: string) {
    const settings = await getSettings();
    if (!settings.autoSummarize || !settings.aiEnabled || !settings.aiApiKey) return;

    const contexts = (await getStorageData('contexts')) || [];
    const ctx = contexts.find((c: any) => c.id === contextId);
    if (!ctx) return;

    const content = ctx.mainContent || ctx.chatContent || ctx.selection || '';
    if (content.length < 100) return;

    try {
      const router = await getAIRouter();
      const { detectLanguage } = await import('../lib/nlp-engine');
      const language = settings.language === 'auto' ? detectLanguage(content) : settings.language;
      const { result } = await router.summarize(content, { language, maxLength: 500 });

      if (result) {
        const freshContexts = (await getStorageData('contexts')) || [];
        const idx = freshContexts.findIndex((c: any) => c.id === contextId);
        if (idx !== -1) {
          freshContexts[idx].aiSummary = result;
          await setStorageData('contexts', freshContexts);
        }
      }
    } catch { /* ignore auto-summarize errors */ }
  }

  async function manualSummarizeContext(contextId: string) {
    try {
      const router = await getAIRouter();
      const contexts = (await getStorageData('contexts')) || [];
      const ctx = contexts.find((c: any) => c.id === contextId);
      if (!ctx) return { success: false, error: 'Context not found' };

      const content = ctx.mainContent || ctx.chatContent || ctx.selection || '';
      if (content.length < 50) return { success: false, error: 'Content too short' };

      const settings = await getSettings();
      const { detectLanguage } = await import('../lib/nlp-engine');
      const language = settings.language === 'auto' ? detectLanguage(content) : settings.language;
      const { result } = await router.summarize(content, { language, maxLength: 500 });

      if (result) {
        const freshContexts = (await getStorageData('contexts')) || [];
        const idx = freshContexts.findIndex((c: any) => c.id === contextId);
        if (idx !== -1) {
          freshContexts[idx].aiSummary = result;
          await setStorageData('contexts', freshContexts);
        }
        return { success: true, summary: result };
      }
      return { success: false, error: 'AI returned empty response' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function getLatestContext() {
    const contexts = (await getStorageData('contexts')) || [];
    return contexts.length > 0 ? contexts[0] : null;
  }

  async function getAllContexts() {
    return (await getStorageData('contexts')) || [];
  }

  async function deleteContext(id: string) {
    try {
      let contexts = (await getStorageData('contexts')) || [];
      contexts = contexts.filter((ctx: any) => ctx.id !== id);
      await setStorageData('contexts', contexts);
      await updateBadge();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function clearAllContexts() {
    await setStorageData('contexts', []);
    await updateBadge();
    return { success: true };
  }

  async function updateContext(data: any) {
    try {
      const contexts = (await getStorageData('contexts')) || [];
      const idx = contexts.findIndex((c: any) => c.id === data.id);
      if (idx === -1) return { success: false, error: 'Context not found' };
      contexts[idx] = { ...contexts[idx], ...data };
      await setStorageData('contexts', contexts);
      return { success: true, context: contexts[idx] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ==================== Settings ====================

  const DEFAULT_SETTINGS = {
    enableInjection: true,
    language: 'auto',
    theme: 'system',
    defaultTemplate: 'standard',
    aiEnabled: false,
    aiProvider: 'openai',
    aiApiKey: '',
    aiBaseUrl: '',
    aiModel: 'gpt-4o-mini',
    autoSummarize: true,
    captureDepth: 'standard',
    autoCapture: false,
    autoCapturePatterns: '',
    localAiEnabled: true,
    knowledgeGraphEnabled: true,
    maxKnowledgeNodes: 5000,
    mcpServers: [],
    mcpServerEnabled: false,
    mcpServerPort: 19960,
  };

  async function getSettings() {
    try {
      const settings = await getStorageData('settings');
      return { ...DEFAULT_SETTINGS, ...settings };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }

  async function saveSettings(newSettings: any) {
    try {
      const current = await getSettings();
      const merged = { ...current, ...newSettings };
      await setStorageData('settings', merged);
      if (_aiRouter) _aiRouter.updateCloudSettings(merged);

      // Reconnect native messaging if MCP setting changed
      if (merged.mcpServerEnabled && !_nativePort) {
        setupNativeMessaging().catch(() => {});
      } else if (!merged.mcpServerEnabled && _nativePort) {
        _nativePort.disconnect();
        _nativePort = null;
      }

      return { success: true, settings: merged };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ==================== Templates ====================

  async function getTemplates() {
    const { DEFAULT_TEMPLATES } = await import('../lib/prompt/templates');
    const custom = (await getStorageData('customTemplates')) || [];
    return [...DEFAULT_TEMPLATES, ...custom];
  }

  async function saveTemplate(template: any) {
    try {
      const custom = (await getStorageData('customTemplates')) || [];
      if (template.id) {
        const idx = custom.findIndex((t: any) => t.id === template.id);
        if (idx >= 0) custom[idx] = template;
        else custom.push(template);
      } else {
        template.id = 'custom_' + Date.now();
        custom.push(template);
      }
      await setStorageData('customTemplates', custom);
      return { success: true, template };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function deleteTemplate(id: string) {
    let custom = (await getStorageData('customTemplates')) || [];
    custom = custom.filter((t: any) => t.id !== id);
    await setStorageData('customTemplates', custom);
    return { success: true };
  }

  // ==================== AI Actions ====================

  async function summarizeWithAI(data: any) {
    try {
      const router = await getAIRouter();
      const { result, level } = await router.summarize(data.content || '', {
        language: data.language,
        maxLength: data.maxLength || 300,
      });
      return { success: true, summary: result, level };
    } catch (error) {
      return { success: false, error: (error as Error).message, fallback: true };
    }
  }

  async function analyzePromptQuality(data: any) {
    try {
      const router = await getAIRouter();
      const analysis = await router.analyzePromptQuality(data.prompt || '');
      return { success: true, analysis };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function fuseContextsAction(data: any) {
    try {
      const router = await getAIRouter();
      const { result } = await router.fuseContexts(data.contexts || []);
      return { success: true, fusedContent: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function testAIConnection() {
    try {
      const router = await getAIRouter();
      return await router.testConnection();
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  // ==================== Prompt History ====================

  async function savePromptHistory(data: any) {
    const history = (await getStorageData('promptHistory')) || [];
    history.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      prompt: data.prompt || '',
      template: data.template || '',
      contextTitle: data.contextTitle || '',
      favorite: false,
    });
    if (history.length > MAX_HISTORY) history.pop();
    await setStorageData('promptHistory', history);
    return { success: true };
  }

  async function getPromptHistory() {
    return (await getStorageData('promptHistory')) || [];
  }

  async function clearPromptHistory() {
    await setStorageData('promptHistory', []);
    return { success: true };
  }

  // ==================== Favorites ====================

  async function toggleFavorite(id: string) {
    const history = (await getStorageData('promptHistory')) || [];
    const idx = history.findIndex((h: any) => h.id === id);
    if (idx === -1) return { success: false, error: 'Not found' };
    history[idx].favorite = !history[idx].favorite;
    await setStorageData('promptHistory', history);
    return { success: true, favorite: history[idx].favorite };
  }

  async function getFavorites() {
    const history = (await getStorageData('promptHistory')) || [];
    return history.filter((h: any) => h.favorite);
  }

  // ==================== Export / Import ====================

  async function exportData() {
    const contexts = (await getStorageData('contexts')) || [];
    const settings = await getSettings();
    const templates = (await getStorageData('customTemplates')) || [];
    const history = (await getStorageData('promptHistory')) || [];

    // Export knowledge graph data
    let knowledgeNodes: any[] = [];
    let knowledgeRelations: any[] = [];
    try {
      const { db } = await import('../lib/storage/db');
      knowledgeNodes = await db.knowledgeNodes.toArray();
      knowledgeRelations = await db.relations.toArray();

      // Serialize Float32Array embeddings to plain arrays for JSON export
      const embeddings = await db.embeddings.toArray();
      const serializedEmbeddings = embeddings.map((e: any) => ({
        ...e,
        vector: e.vector instanceof Float32Array ? Array.from(e.vector) : e.vector,
      }));

      return {
        success: true,
        data: {
          version: '4.0.0',
          exportedAt: new Date().toISOString(),
          contexts,
          settings,
          customTemplates: templates,
          promptHistory: history,
          knowledgeNodes,
          knowledgeRelations,
          embeddings: serializedEmbeddings,
        },
      };
    } catch {
      return {
        success: true,
        data: {
          version: '4.0.0',
          exportedAt: new Date().toISOString(),
          contexts,
          settings,
          customTemplates: templates,
          promptHistory: history,
        },
      };
    }
  }

  async function importData(data: any) {
    if (!data?.version) return { success: false, error: 'Invalid data' };
    let imported = 0;

    if (Array.isArray(data.contexts)) {
      const existing = (await getStorageData('contexts')) || [];
      const existingIds = new Set(existing.map((c: any) => c.id));
      const newContexts = data.contexts.filter((c: any) => !existingIds.has(c.id));
      const merged = [...newContexts, ...existing].slice(0, MAX_CONTEXTS);
      await setStorageData('contexts', merged);
      imported = newContexts.length;
    }
    if (Array.isArray(data.customTemplates)) {
      const existing = (await getStorageData('customTemplates')) || [];
      const existingIds = new Set(existing.map((t: any) => t.id));
      const newTemplates = data.customTemplates.filter((t: any) => !existingIds.has(t.id));
      await setStorageData('customTemplates', [...existing, ...newTemplates]);
    }
    if (Array.isArray(data.promptHistory)) {
      const existing = (await getStorageData('promptHistory')) || [];
      const existingIds = new Set(existing.map((h: any) => h.id));
      const newHistory = data.promptHistory.filter((h: any) => !existingIds.has(h.id));
      await setStorageData('promptHistory', [...newHistory, ...existing].slice(0, MAX_HISTORY));
    }

    // Import knowledge graph data
    if (Array.isArray(data.knowledgeNodes) && data.knowledgeNodes.length > 0) {
      try {
        const { db } = await import('../lib/storage/db');
        await db.knowledgeNodes.bulkPut(data.knowledgeNodes);

        if (Array.isArray(data.knowledgeRelations)) {
          await db.relations.bulkPut(data.knowledgeRelations);
        }

        // Rebuild embeddings from serialized arrays
        if (Array.isArray(data.embeddings)) {
          for (const emb of data.embeddings) {
            const vector = emb.vector instanceof Float32Array
              ? emb.vector
              : new Float32Array(emb.vector);
            await db.embeddings.put({ ...emb, vector });
          }
        }

        // Rebuild search index
        const { hybridSearch } = await import('../lib/storage/search');
        await hybridSearch.rebuildIndex();
      } catch {
        // Ignore knowledge import errors
      }
    }

    await updateBadge();
    return { success: true, imported };
  }

  // ==================== Tags ====================

  async function suggestTags(data: any) {
    const { extractKeywords } = await import('../lib/nlp-engine');
    const content = data.content || data.title || '';
    return { success: true, tags: extractKeywords(content, 5) };
  }

  // ==================== v4: Knowledge Graph ====================

  let _knowledgeGraph: import('../lib/storage/knowledge-graph').KnowledgeGraph | null = null;

  async function getKnowledgeGraph() {
    if (!_knowledgeGraph) {
      const { knowledgeGraph } = await import('../lib/storage/knowledge-graph');
      _knowledgeGraph = knowledgeGraph;
    }
    return _knowledgeGraph;
  }

  async function searchKnowledge(data: any) {
    try {
      const kg = await getKnowledgeGraph();
      const results = await kg.searchNodes(data.query || '');
      return { success: true, results };
    } catch (error) {
      return { success: false, error: (error as Error).message, results: [] };
    }
  }

  async function addToKnowledge(data: any) {
    try {
      const kg = await getKnowledgeGraph();
      const node = await kg.addFromContext(data);
      return { success: true, node };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function getRelatedNodesAction(data: any) {
    try {
      const kg = await getKnowledgeGraph();
      const related = await kg.getRelatedNodes(data.nodeId);
      return { success: true, related };
    } catch (error) {
      return { success: false, error: (error as Error).message, related: [] };
    }
  }

  async function getKnowledgeGraphData() {
    try {
      const kg = await getKnowledgeGraph();
      const graphData = await kg.getGraphData();
      return { success: true, ...graphData };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async function getKnowledgeStats() {
    try {
      const kg = await getKnowledgeGraph();
      const stats = await kg.getStats();
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ==================== Workflow Actions ====================

  async function getWorkflowsAction() {
    const { workflowEngine } = await import('../lib/workflow/engine');
    const { WORKFLOW_TEMPLATES } = await import('../lib/workflow/templates');

    // Initialize with templates if empty
    if (workflowEngine.getWorkflows().length === 0) {
      for (const tpl of WORKFLOW_TEMPLATES) {
        workflowEngine.addWorkflow(tpl);
      }
      // Load custom workflows from storage
      const custom = (await getStorageData('customWorkflows')) || [];
      for (const wf of custom) {
        workflowEngine.addWorkflow(wf);
      }
    }

    return { success: true, workflows: workflowEngine.getWorkflows() };
  }

  async function saveWorkflowAction(data: any) {
    const { workflowEngine } = await import('../lib/workflow/engine');
    const workflow = {
      ...data,
      id: data.id || 'custom_' + Date.now(),
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    workflowEngine.addWorkflow(workflow);

    // Persist custom workflows
    const all = workflowEngine.getWorkflows().filter((w: any) => w.id.startsWith('custom_'));
    await setStorageData('customWorkflows', all);

    return { success: true, workflow };
  }

  async function deleteWorkflowAction(id: string) {
    const { workflowEngine } = await import('../lib/workflow/engine');
    workflowEngine.removeWorkflow(id);

    const all = workflowEngine.getWorkflows().filter((w: any) => w.id.startsWith('custom_'));
    await setStorageData('customWorkflows', all);

    return { success: true };
  }

  async function executeWorkflowAction(data: any) {
    const { workflowEngine } = await import('../lib/workflow/engine');

    // Ensure workflows are loaded
    if (workflowEngine.getWorkflows().length === 0) {
      await getWorkflowsAction();
    }

    const workflow = workflowEngine.getWorkflow(data.workflowId);
    if (!workflow) return { success: false, error: 'Workflow not found' };

    const execution = await workflowEngine.execute(workflow, data.context || {});
    return { success: true, ...execution };
  }

  // ==================== Offscreen Document ====================

  let offscreenCreated = false;

  async function ensureOffscreenDocument() {
    if (offscreenCreated) return;
    try {
      await (chrome.offscreen as any).createDocument({
        url: chrome.runtime.getURL('/offscreen.html'),
        reasons: ['WORKERS'],
        justification: 'Run Transformers.js embedding pipeline',
      });
      offscreenCreated = true;
    } catch {
      // Already exists or not supported
      offscreenCreated = true;
    }
  }

  // ==================== MCP Native Messaging ====================

  let _nativePort: chrome.runtime.Port | null = null;

  async function setupNativeMessaging() {
    // Only connect if MCP Server is enabled in settings
    const settings = await getSettings();
    if (!settings.mcpServerEnabled) return;

    try {
      _nativePort = chrome.runtime.connectNative('com.contextprompt.ai');

      _nativePort.onMessage.addListener(async (message: any) => {
        if (message.type === 'mcp_request' && message.payload) {
          const response = await handleMCPRequest(message.payload);
          _nativePort?.postMessage({ ...response, _nativeId: message._nativeId });
        }
      });

      _nativePort.onDisconnect.addListener(() => {
        // Silence chrome.runtime.lastError to prevent unchecked error
        const _err = chrome.runtime.lastError;
        _nativePort = null;
      });
    } catch {
      // Native messaging host not installed — that's OK
      _nativePort = null;
    }
  }

  async function handleMCPRequest(jsonRpc: any) {
    const { MCP_METHODS, createSuccessResponse, createErrorResponse, JSONRPC_ERRORS, SERVER_INFO } =
      await import('../lib/mcp/protocol');
    const { MCP_TOOLS, createToolHandlers } = await import('../lib/mcp/server-tools');

    const { id, method, params } = jsonRpc;

    if (method === MCP_METHODS.INITIALIZE) {
      return createSuccessResponse(id, {
        protocolVersion: SERVER_INFO.protocolVersion,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });
    }

    if (method === MCP_METHODS.TOOLS_LIST) {
      return createSuccessResponse(id, { tools: MCP_TOOLS });
    }

    if (method === MCP_METHODS.TOOLS_CALL) {
      const kg = await getKnowledgeGraph();
      const { contextOrchestrator } = await import('../lib/context/orchestrator');
      const { db } = await import('../lib/storage/db');

      const handlers = createToolHandlers({
        searchKnowledge: async (query) => {
          const nodes = await kg.searchNodes(query);
          return nodes;
        },
        assembleContext: async (query, model) => {
          return contextOrchestrator.assembleContext(query, { model });
        },
        captureCurrentTab: async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) return { success: false, error: 'No active tab' };
          await captureFromTab(tab);
          return { success: true };
        },
        listKnowledgeNodes: async (limit) => {
          return db.knowledgeNodes.orderBy('createdAt').reverse().limit(limit).toArray();
        },
        getStats: async () => {
          return kg.getStats();
        },
      });

      const toolName = params?.name as string;
      const handler = handlers[toolName];
      if (!handler) {
        return createErrorResponse(id, JSONRPC_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
      }

      try {
        const result = await handler((params?.arguments || {}) as Record<string, unknown>);
        return createSuccessResponse(id, result);
      } catch (err) {
        return createErrorResponse(id, JSONRPC_ERRORS.INTERNAL_ERROR, (err as Error).message);
      }
    }

    return createErrorResponse(id, JSONRPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }

  // Try to set up native messaging on startup (non-blocking, only if enabled)
  setupNativeMessaging().catch(() => {});

  // ==================== Badge ====================

  async function updateBadge() {
    try {
      const contexts = (await getStorageData('contexts')) || [];
      const count = contexts.length;
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#0D9488' });
    } catch { /* ignore */ }
  }

  // ==================== v3 → v4 Migration ====================

  async function migrateFromV3() {
    try {
      // Migrate session storage to local (v3 compat)
      const sessionData = await getStorageData('contexts', 'session');
      if (sessionData?.length > 0) {
        const existing = (await getStorageData('contexts')) || [];
        const merged = [...sessionData, ...existing].slice(0, MAX_CONTEXTS);
        await setStorageData('contexts', merged);
        chrome.storage.session.remove('contexts');
      }
    } catch { /* ignore migration errors */ }
  }
});
