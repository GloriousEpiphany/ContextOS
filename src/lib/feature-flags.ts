/**
 * Feature flags for the 8 sprint expansions.
 * Stored in chrome.storage.local (boring tech, native KV, cross-context sync,
 * onChanged events). Not in Dexie KG — keeps MCP server tools from accidentally
 * leaking internal product state.
 *
 * See CEO plan 2026-05-01 + eng review for the override rationale.
 */

export type FeatureFlagKey =
  | 'mcp_oneclick_install'      // Exp #1
  | 'openreview_scores'          // Exp #2
  | 'native_host_diagnose'       // Exp #3
  | 'github_repo_link'           // Exp #4
  | 'ai_conversation_observer'   // Exp #5 — default OFF, opt-in (privacy)
  | 'sprint_dashboard'           // Pick #6
  | 'paper_badge_hover'          // Pick #7
  | 'cvpr_pdf_fallback';         // Pick #8

export interface FeatureFlag {
  enabled: boolean;
  /** When the flag was last toggled. */
  updated_at: number;
}

const STORAGE_KEY = 'contextos_feature_flags';

/** Defaults: most ON, Exp #5 OFF (privacy: AI conversation observation requires explicit opt-in). */
const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  mcp_oneclick_install: true,
  openreview_scores: true,
  native_host_diagnose: true,
  github_repo_link: true,
  ai_conversation_observer: false,
  sprint_dashboard: true,
  paper_badge_hover: true,
  cvpr_pdf_fallback: true,
};

type FlagsMap = Record<FeatureFlagKey, FeatureFlag>;

async function readAll(): Promise<FlagsMap> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = (result[STORAGE_KEY] as Partial<FlagsMap>) ?? {};
  const now = Date.now();
  const out = {} as FlagsMap;
  for (const key of Object.keys(DEFAULTS) as FeatureFlagKey[]) {
    out[key] = stored[key] ?? { enabled: DEFAULTS[key], updated_at: now };
  }
  return out;
}

async function writeAll(flags: FlagsMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: flags });
}

/** Read a single flag. Cheap; safe to call from content scripts. */
export async function isEnabled(key: FeatureFlagKey): Promise<boolean> {
  const flags = await readAll();
  return flags[key].enabled;
}

/** Set a flag. */
export async function setFlag(key: FeatureFlagKey, enabled: boolean): Promise<void> {
  const flags = await readAll();
  flags[key] = { enabled, updated_at: Date.now() };
  await writeAll(flags);
}

/** Get every flag (for Settings UI). */
export async function getAll(): Promise<FlagsMap> {
  return readAll();
}

/** Subscribe to flag changes. Returns an unsubscribe fn. */
export function onChange(
  listener: (changed: Partial<Record<FeatureFlagKey, boolean>>) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue as FlagsMap | undefined;
    const prev = changes[STORAGE_KEY].oldValue as FlagsMap | undefined;
    if (!next) return;
    const diff: Partial<Record<FeatureFlagKey, boolean>> = {};
    for (const key of Object.keys(DEFAULTS) as FeatureFlagKey[]) {
      const prevEnabled = prev?.[key]?.enabled ?? DEFAULTS[key];
      const nextEnabled = next[key]?.enabled ?? DEFAULTS[key];
      if (nextEnabled !== prevEnabled) {
        diff[key] = nextEnabled;
      }
    }
    if (Object.keys(diff).length) listener(diff);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export const __TEST_ONLY__ = { DEFAULTS, STORAGE_KEY };
