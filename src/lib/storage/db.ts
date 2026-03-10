// ============================================================================
// ContextPrompt AI v4.0 - Dexie Database
// ============================================================================

import Dexie from 'dexie';
import type {
  CapturedContext,
  KnowledgeNode,
  NodeEmbedding,
  NodeRelation,
  PromptHistoryEntry,
  AppSettings,
  PromptTemplate,
} from '@/types/index';
import { DEFAULT_SETTINGS } from '@/types/index';

// ----------------------------------------------------------------------------
// Database Schema
// ----------------------------------------------------------------------------

class ContextPromptDB extends Dexie {
  contexts!: Dexie.Table<CapturedContext, string>;
  knowledgeNodes!: Dexie.Table<KnowledgeNode, number>;
  embeddings!: Dexie.Table<NodeEmbedding, number>;
  relations!: Dexie.Table<NodeRelation, number>;
  promptHistory!: Dexie.Table<PromptHistoryEntry, string>;

  constructor() {
    super('ContextPromptAI');

    // Version 1: Initial v4 schema
    this.version(1).stores({
      contexts: 'id, timestamp, url',
      knowledgeNodes: '++id, contextId, title, createdAt, *tags',
      embeddings: '++id, nodeId',
      relations: '++id, sourceId, targetId, [sourceId+targetId]',
      promptHistory: 'id, timestamp, favorite',
    });

    // Float32Array serialization hook for embeddings
    this.embeddings.hook('reading', (obj: NodeEmbedding) => {
      if (obj.vector && !(obj.vector instanceof Float32Array)) {
        obj.vector = new Float32Array(obj.vector as unknown as ArrayLike<number>);
      }
      return obj;
    });
  }
}

// Singleton instance
export const db = new ContextPromptDB();

// ----------------------------------------------------------------------------
// v3 -> v4 Migration (chrome.storage.local -> IndexedDB)
// ----------------------------------------------------------------------------

const V3_MIGRATION_KEY = 'contextprompt_v4_migrated';

/**
 * Migrate data from chrome.storage.local (v3) to Dexie/IndexedDB (v4).
 * This is idempotent -- it checks a flag and only runs once.
 */
export async function migrateFromV3(): Promise<{ migrated: boolean; counts: Record<string, number> }> {
  // Guard: only run in extension context
  if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
    return { migrated: false, counts: {} };
  }

  const flagCheck = await chrome.storage.local.get(V3_MIGRATION_KEY);
  if (flagCheck[V3_MIGRATION_KEY]) {
    return { migrated: false, counts: {} };
  }

  const counts: Record<string, number> = {
    contexts: 0,
    promptHistory: 0,
    templates: 0,
    settings: 0,
  };

  try {
    const stored = await chrome.storage.local.get(null);

    // --- Migrate contexts ---
    // v3 stored contexts under the key 'contexts' as an array, or individual
    // keys like 'context_<id>'. We handle both patterns.
    const v3Contexts: CapturedContext[] = [];

    if (Array.isArray(stored['contexts'])) {
      v3Contexts.push(...stored['contexts']);
    }

    // Also check for individually-stored contexts
    for (const key of Object.keys(stored)) {
      if (key.startsWith('context_') && typeof stored[key] === 'object' && stored[key]?.id) {
        const ctx = stored[key] as CapturedContext;
        // Avoid duplicates
        if (!v3Contexts.some((c) => c.id === ctx.id)) {
          v3Contexts.push(ctx);
        }
      }
    }

    if (v3Contexts.length > 0) {
      // Ensure all required fields exist with defaults for any missing ones
      const normalized = v3Contexts.map((ctx) => normalizeContext(ctx));
      await db.contexts.bulkPut(normalized);
      counts.contexts = normalized.length;
    }

    // --- Migrate prompt history ---
    const v3History: PromptHistoryEntry[] = [];

    if (Array.isArray(stored['promptHistory'])) {
      v3History.push(...stored['promptHistory']);
    }

    if (v3History.length > 0) {
      await db.promptHistory.bulkPut(v3History);
      counts.promptHistory = v3History.length;
    }

    // --- Migrate settings ---
    // v3 stored settings under the key 'settings'
    if (stored['settings'] && typeof stored['settings'] === 'object') {
      const v3Settings = stored['settings'] as Partial<AppSettings>;
      const merged: AppSettings = { ...DEFAULT_SETTINGS, ...v3Settings };
      await chrome.storage.local.set({ settings_v4: merged });
      counts.settings = 1;
    }

    // --- Migrate templates ---
    if (Array.isArray(stored['templates'])) {
      // Keep templates in chrome.storage.local for quick popup access
      // but also mark them as migrated
      counts.templates = stored['templates'].length;
    }

    // Set migration flag
    await chrome.storage.local.set({ [V3_MIGRATION_KEY]: Date.now() });

    console.log('[ContextPrompt] v3 -> v4 migration complete', counts);
    return { migrated: true, counts };
  } catch (err) {
    console.error('[ContextPrompt] v3 -> v4 migration failed:', err);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// Settings helpers (settings stay in chrome.storage.local for sync perf)
// ----------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
    return { ...DEFAULT_SETTINGS };
  }
  const result = await chrome.storage.local.get('settings_v4');
  if (result['settings_v4']) {
    return { ...DEFAULT_SETTINGS, ...result['settings_v4'] };
  }
  // Fallback: check for v3 settings key
  const legacy = await chrome.storage.local.get('settings');
  if (legacy['settings']) {
    return { ...DEFAULT_SETTINGS, ...legacy['settings'] };
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...settings };
  await chrome.storage.local.set({ settings_v4: updated });
  return updated;
}

// ----------------------------------------------------------------------------
// Template helpers (kept in chrome.storage.local)
// ----------------------------------------------------------------------------

export async function getTemplates(): Promise<PromptTemplate[]> {
  if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
    return [];
  }
  const result = await chrome.storage.local.get('templates');
  return Array.isArray(result['templates']) ? result['templates'] : [];
}

export async function saveTemplate(template: PromptTemplate): Promise<void> {
  const templates = await getTemplates();
  const idx = templates.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    templates[idx] = template;
  } else {
    templates.push(template);
  }
  await chrome.storage.local.set({ templates });
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await getTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  await chrome.storage.local.set({ templates: filtered });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function normalizeContext(raw: Partial<CapturedContext> & { id: string }): CapturedContext {
  return {
    id: raw.id,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    title: raw.title ?? '',
    url: raw.url ?? '',
    selection: raw.selection ?? '',
    description: raw.description ?? '',
    ogData: raw.ogData ?? {},
    structuredData: raw.structuredData ?? {},
    mainContent: raw.mainContent ?? '',
    chatContent: raw.chatContent ?? '',
    isPrivateLink: raw.isPrivateLink ?? false,
    platformName: raw.platformName ?? '',
    captureDepth: raw.captureDepth ?? 'standard',
    notes: raw.notes ?? '',
    tags: raw.tags ?? [],
    aiSummary: raw.aiSummary ?? '',
  };
}
