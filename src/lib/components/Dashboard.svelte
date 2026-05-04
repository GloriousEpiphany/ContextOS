<!--
  Pick #6 — Sprint Dashboard
  N=1 → N=5 install + retention progress, visible inside the sidepanel.

  Self-discipline tool: the founder opens the sidepanel daily and sees the only
  KPI that matters during this sprint (5 external researchers, ≥7 day retention).
  Reads state from chrome.storage.local key `contextos_sprint_progress`.

  Wiring into sidepanel App.svelte happens in a follow-up commit.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Install {
    /** Anonymous label, e.g. "@friend-from-cv-lab". User-entered. */
    label: string;
    /** ISO date when install was confirmed. */
    installedAt: string;
    /** Days the user has actively used (founder updates manually). */
    activeDays: number;
  }

  interface SprintProgress {
    /** Sprint start date (ISO). Day 1 = founder runs setup-flag. */
    startedAt: string;
    /** Sprint length in days (default 30). */
    targetDays: number;
    /** Install records (max 5). */
    installs: Install[];
    /** Target install count (default 5). */
    targetInstalls: number;
  }

  const STORAGE_KEY = 'contextos_sprint_progress';

  let progress = $state<SprintProgress>({
    startedAt: new Date().toISOString(),
    targetDays: 30,
    installs: [],
    targetInstalls: 5,
  });
  let loaded = $state(false);

  // Derived KPIs
  let dayN = $derived.by(() => {
    const start = new Date(progress.startedAt).getTime();
    const days = Math.floor((Date.now() - start) / 86_400_000) + 1;
    return Math.max(1, Math.min(progress.targetDays, days));
  });
  let installCount = $derived(progress.installs.length);
  let retainedCount = $derived(progress.installs.filter((i) => i.activeDays >= 7).length);
  let dayPercent = $derived(((dayN - 1) / (progress.targetDays - 1)) * 100);
  let installPercent = $derived(
    (installCount / progress.targetInstalls) * 100,
  );

  let unsub: (() => void) | null = null;

  onMount(async () => {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      loaded = true;
      return;
    }
    const r = await chrome.storage.local.get(STORAGE_KEY);
    if (r[STORAGE_KEY]) {
      progress = { ...progress, ...(r[STORAGE_KEY] as Partial<SprintProgress>) };
    } else {
      // First run: persist defaults so dayN counts from today
      await chrome.storage.local.set({ [STORAGE_KEY]: progress });
    }
    loaded = true;

    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area === 'local' && changes[STORAGE_KEY]?.newValue) {
        progress = changes[STORAGE_KEY].newValue as SprintProgress;
      }
    };
    chrome.storage.onChanged.addListener(handler);
    unsub = () => chrome.storage.onChanged.removeListener(handler);
  });

  onDestroy(() => unsub?.());
</script>

<section class="dashboard" aria-label="Sprint progress dashboard">
  {#if !loaded}
    <div class="empty">…</div>
  {:else}
    <div class="eyebrow">Sprint progress</div>

    <div class="day-line">
      <span class="day-num">{dayN}</span><span class="day-total">/{progress.targetDays}</span>
    </div>

    <div class="bar" aria-hidden="true">
      <div class="bar-fill" style="width: {dayPercent}%"></div>
    </div>

    <div class="kpi">
      <div class="kpi-num">
        <span class="kpi-active">{installCount}</span><span class="kpi-of">/{progress.targetInstalls}</span>
      </div>
      <div class="kpi-desc">EXTERNAL RESEARCHERS<br />INSTALLED</div>
    </div>

    <div class="kpi-row">
      <div class="kpi-mini">
        <span class="kpi-mini-num">{retainedCount}</span>
        <span class="kpi-mini-desc">7-day retained</span>
      </div>
      <div class="kpi-mini">
        <span class="kpi-mini-num">{progress.installs.reduce((s, i) => s + i.activeDays, 0)}</span>
        <span class="kpi-mini-desc">total active days</span>
      </div>
    </div>

    {#if installCount === 0}
      <p class="hint">
        No external installs yet. Day 6-7 of the sprint is dedicated to outreach
        — DM 30 researchers, install with 5.
      </p>
    {:else if installCount < progress.targetInstalls}
      <p class="hint">
        {progress.targetInstalls - installCount} more install{progress.targetInstalls - installCount === 1 ? '' : 's'} to hit the KPI.
      </p>
    {:else}
      <p class="hint hint-good">
        All {progress.targetInstalls} installs locked in. Now watch retention.
      </p>
    {/if}
  {/if}
</section>

<style>
  .dashboard {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-base);
    color: var(--text);
    font-family: var(--font-body);
  }

  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: var(--space-sm);
  }

  .day-line {
    font-family: var(--font-display);
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.03em;
    font-variation-settings: "opsz" 96;
    color: var(--text);
  }
  .day-num {
    font-size: 56px;
    color: var(--accent);
    font-style: italic;
    font-variation-settings: "opsz" 96, "slnt" -8;
  }
  .day-total {
    font-size: 32px;
    color: var(--muted);
    font-weight: 400;
  }

  .bar {
    height: 2px;
    background: var(--border);
    border-radius: 1px;
    margin-top: var(--space-base);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width var(--dur-long) var(--ease);
  }

  .kpi {
    margin-top: var(--space-base);
    padding-top: var(--space-base);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-md);
    font-family: var(--font-ui);
    font-feature-settings: "tnum";
  }
  .kpi-num { font-size: 22px; font-weight: 600; color: var(--text); }
  .kpi-active { color: var(--accent); }
  .kpi-of { color: var(--muted); }
  .kpi-desc {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-align: right;
    line-height: 1.3;
  }

  .kpi-row {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }
  .kpi-mini {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpi-mini-num {
    font-family: var(--font-ui);
    font-feature-settings: "tnum";
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }
  .kpi-mini-desc {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .hint {
    margin-top: var(--space-md);
    font-size: var(--text-sm);
    color: var(--muted);
    line-height: 1.45;
  }
  .hint-good { color: var(--success); }

  .empty {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
</style>
