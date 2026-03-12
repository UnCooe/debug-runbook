import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNBOOK_DIR = path.resolve(__dirname, '..', 'runbooks');
const CONTEXT_WEIGHT = 3;
let registryCache = null;

export async function selectRunbook(incident) {
  const registry = await loadRunbookRegistry();
  const scored = registry.map((runbook) => scoreRunbook(runbook, incident)).sort(compareCandidates);

  return {
    selected: scored[0]?.name ?? 'request_not_effective',
    candidates: scored
  };
}

export async function listRunbooks() {
  const registry = await loadRunbookRegistry();
  return registry.map((item) => item.name);
}

async function loadRunbookRegistry() {
  if (registryCache) {
    return registryCache;
  }

  const entries = await readdir(RUNBOOK_DIR, { withFileTypes: true });
  const metadataFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.selector.json'));
  const metadata = await Promise.all(
    metadataFiles.map(async (entry) => {
      const filePath = path.join(RUNBOOK_DIR, entry.name);
      const content = await readFile(filePath, 'utf8');
      return JSON.parse(content);
    })
  );

  registryCache = metadata;
  return registryCache;
}

function scoreRunbook(runbook, incident) {
  const haystack = `${incident.symptom || ''} ${incident.expected || ''}`.toLowerCase();
  const matchedSignals = [];
  let score = 0;

  if ((runbook.context_types || []).includes(incident.context_type)) {
    score += CONTEXT_WEIGHT;
    matchedSignals.push(`context:${incident.context_type}(+${CONTEXT_WEIGHT})`);
  }

  for (const signal of runbook.positive_signals || []) {
    if (matchesSignal(signal, haystack)) {
      score += signal.weight;
      matchedSignals.push(`${signal.pattern}(+${signal.weight})`);
    }
  }

  for (const signal of runbook.negative_signals || []) {
    if (matchesSignal(signal, haystack)) {
      score += signal.weight;
      matchedSignals.push(`${signal.pattern}(${signal.weight})`);
    }
  }

  score += (runbook.priority || 0) * 0.01;
  return {
    name: runbook.name,
    score: Number(score.toFixed(2)),
    matched_signals: matchedSignals
  };
}

function matchesSignal(signal, haystack) {
  if (signal.mode === 'regex') {
    return new RegExp(signal.pattern, 'i').test(haystack);
  }
  return haystack.includes(String(signal.pattern).toLowerCase());
}

function compareCandidates(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return right.name.localeCompare(left.name);
}
