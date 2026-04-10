import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BUILTIN_RUNBOOK_DIR = path.resolve(__dirname, '..', '..', 'runbooks');

export type RunbookFileKind = 'yaml' | 'selector' | 'execution' | 'decision';

export function normalizeConfiguredRunbooks(runbooks: string[] = []): string[] {
  return [...new Set(
    runbooks
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => path.resolve(item))
  )].sort();
}

export function getRunbookNameFromPath(runbookPath: string): string {
  return path.basename(stripYamlExtension(runbookPath));
}

export async function resolveRunbookFilePath(
  runbookName: string,
  kind: RunbookFileKind,
  configuredRunbooks: string[] = [],
): Promise<string> {
  for (const runbookPath of normalizeConfiguredRunbooks(configuredRunbooks)) {
    if (getRunbookNameFromPath(runbookPath) !== runbookName) {
      continue;
    }

    const candidate = kind === 'yaml'
      ? runbookPath
      : `${stripYamlExtension(runbookPath)}.${kind}.json`;

    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return path.join(
    BUILTIN_RUNBOOK_DIR,
    kind === 'yaml' ? `${runbookName}.yaml` : `${runbookName}.${kind}.json`
  );
}

function stripYamlExtension(runbookPath: string): string {
  return runbookPath.replace(/\.(yaml|yml)$/i, '');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
