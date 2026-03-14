// Runbook Selector - Selects the most appropriate Runbook based on signal weights
// Logic ported from scripts/runbook-selector.mjs, with TypeScript types added
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncidentInput } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Built-in runbooks directory (project root/runbooks/)
const BUILTIN_RUNBOOK_DIR = path.resolve(__dirname, '..', '..', 'runbooks');
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
}

export interface SelectionResult {
  selected: string;
  candidates: RunbookCandidate[];
}

let registryCache: RunbookSelectorMetadata[] | null = null;

export async function selectRunbook(
  incident: IncidentInput,
  extraRunbookDirs: string[] = [],
): Promise<SelectionResult> {
  const registry = await loadRunbookRegistry(extraRunbookDirs);
  const scored = registry
    .map((runbook) => scoreRunbook(runbook, incident))
    .sort(compareCandidates);

  return {
    selected: scored[0]?.name ?? 'request_not_effective',
    candidates: scored,
  };
}

export async function listRunbooks(extraRunbookDirs: string[] = []): Promise<string[]> {
  const registry = await loadRunbookRegistry(extraRunbookDirs);
  return registry.map((item) => item.name);
}

// Clear cache (needed for tests)
export function clearRegistryCache(): void {
  registryCache = null;
}

async function loadRunbookRegistry(extraRunbookDirs: string[]): Promise<RunbookSelectorMetadata[]> {
  if (registryCache) return registryCache;

  const dirs = [BUILTIN_RUNBOOK_DIR, ...extraRunbookDirs];
  const allMetadata: RunbookSelectorMetadata[] = [];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const selectorFiles = entries.filter(
        (e) => e.isFile() && e.name.endsWith('.selector.json')
      );
      const loaded = await Promise.all(
        selectorFiles.map(async (e) => {
          const content = await readFile(path.join(dir, e.name), 'utf-8');
          return JSON.parse(content) as RunbookSelectorMetadata;
        })
      );
      allMetadata.push(...loaded);
    } catch {
      // Directory does not exist or read failed, skip
    }
  }

  registryCache = allMetadata;
  return registryCache;
}

function scoreRunbook(runbook: RunbookSelectorMetadata, incident: IncidentInput): RunbookCandidate {
  const haystack = `${incident.symptom} ${incident.expected}`.toLowerCase();
  const matchedSignals: string[] = [];
  let score = 0;

  if ((runbook.context_types ?? []).includes(incident.context_type)) {
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
  };
}

function matchesSignal(signal: SelectorSignal, haystack: string): boolean {
  if (signal.mode === 'regex') {
    return new RegExp(signal.pattern, 'i').test(haystack);
  }
  return haystack.includes(String(signal.pattern).toLowerCase());
}

function compareCandidates(a: RunbookCandidate, b: RunbookCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  return b.name.localeCompare(a.name);
}
