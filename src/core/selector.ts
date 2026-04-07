// Runbook Selector - Selects the most appropriate Runbook based on signal weights
// Logic ported from scripts/runbook-selector.mjs, with TypeScript types added
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { IncidentInput } from '../types/index.js';
import {
  BUILTIN_RUNBOOK_DIR,
  getRunbookNameFromPath,
  normalizeConfiguredRunbooks,
} from './runbook-paths.js';
const CONTEXT_WEIGHT = 3;

interface SelectorSignal {
  pattern: string;
  weight: number;
  mode?: 'regex';
}

interface RunbookSelectorMetadata {
  name: string;
  priority: number;
  context_types: string[];
  positive_signals: SelectorSignal[];
  negative_signals: SelectorSignal[];
}

export interface RunbookCandidate {
  name: string;
  score: number;
  matched_signals: string[];
  context_supported: boolean;
}

export interface SelectionResult {
  selected: string;
  candidates: RunbookCandidate[];
}

const registryCache = new Map<string, RunbookSelectorMetadata[]>();

export async function selectRunbook(
  incident: IncidentInput,
  configuredRunbooks: string[] = [],
): Promise<SelectionResult> {
  const registry = await loadRunbookRegistry(configuredRunbooks);
  const scored = registry
    .map((runbook) => scoreRunbook(runbook, incident))
    .sort(compareCandidates);

  return {
    selected: scored[0]?.name ?? 'request_not_effective',
    candidates: scored,
  };
}

export async function listRunbooks(configuredRunbooks: string[] = []): Promise<string[]> {
  const registry = await loadRunbookRegistry(configuredRunbooks);
  return registry.map((item) => item.name);
}

// Clear cache (needed for tests)
export function clearRegistryCache(): void {
  registryCache.clear();
}

async function loadRunbookRegistry(configuredRunbooks: string[]): Promise<RunbookSelectorMetadata[]> {
  const normalizedRunbooks = normalizeConfiguredRunbooks(configuredRunbooks);
  const cacheKey = normalizedRunbooks.join('|');
  const cached = registryCache.get(cacheKey);
  if (cached) return cached;

  const allMetadata = new Map<string, RunbookSelectorMetadata>();

  for (const metadata of await loadBuiltInSelectors()) {
    allMetadata.set(metadata.name, metadata);
  }

  for (const metadata of await loadConfiguredSelectors(normalizedRunbooks)) {
    allMetadata.set(metadata.name, metadata);
  }

  const registry = [...allMetadata.values()];
  registryCache.set(cacheKey, registry);
  return registry;
}

async function loadBuiltInSelectors(): Promise<RunbookSelectorMetadata[]> {
  try {
    const entries = await readdir(BUILTIN_RUNBOOK_DIR, { withFileTypes: true });
    const selectorFiles = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.selector.json')
    );
    return Promise.all(
      selectorFiles.map(async (entry) => {
        const content = await readFile(path.join(BUILTIN_RUNBOOK_DIR, entry.name), 'utf-8');
        return JSON.parse(content) as RunbookSelectorMetadata;
      })
    );
  } catch {
    return [];
  }
}

async function loadConfiguredSelectors(configuredRunbooks: string[]): Promise<RunbookSelectorMetadata[]> {
  const selectors = await Promise.all(
    configuredRunbooks.map(async (runbookPath) => {
      const selectorPath = path.join(
        path.dirname(runbookPath),
        `${getRunbookNameFromPath(runbookPath)}.selector.json`
      );

      try {
        const content = await readFile(selectorPath, 'utf-8');
        return JSON.parse(content) as RunbookSelectorMetadata;
      } catch {
        return null;
      }
    })
  );

  return selectors.filter((item): item is RunbookSelectorMetadata => item !== null);
}

function scoreRunbook(runbook: RunbookSelectorMetadata, incident: IncidentInput): RunbookCandidate {
  const haystack = `${incident.symptom} ${incident.expected}`.toLowerCase();
  const matchedSignals: string[] = [];
  let score = 0;
  const contextSupported = (runbook.context_types ?? []).includes(incident.context_type);

  if (contextSupported) {
    score += CONTEXT_WEIGHT;
    matchedSignals.push(`context:${incident.context_type}(+${CONTEXT_WEIGHT})`);
  }

  for (const signal of runbook.positive_signals ?? []) {
    if (matchesSignal(signal, haystack)) {
      score += signal.weight;
      matchedSignals.push(`${signal.pattern}(+${signal.weight})`);
    }
  }

  for (const signal of runbook.negative_signals ?? []) {
    if (matchesSignal(signal, haystack)) {
      score += signal.weight; // weight is negative
      matchedSignals.push(`${signal.pattern}(${signal.weight})`);
    }
  }

  score += (runbook.priority ?? 0) * 0.01;

  return {
    name: runbook.name,
    score: Number(score.toFixed(2)),
    matched_signals: matchedSignals,
    context_supported: contextSupported,
  };
}

function matchesSignal(signal: SelectorSignal, haystack: string): boolean {
  if (signal.mode === 'regex') {
    return new RegExp(signal.pattern, 'i').test(haystack);
  }
  return haystack.includes(String(signal.pattern).toLowerCase());
}

function compareCandidates(a: RunbookCandidate, b: RunbookCandidate): number {
  if (a.context_supported !== b.context_supported) {
    return Number(b.context_supported) - Number(a.context_supported);
  }
  if (b.score !== a.score) return b.score - a.score;
  return b.name.localeCompare(a.name);
}
