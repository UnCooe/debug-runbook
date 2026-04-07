import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { clearRegistryCache, selectRunbook } from './selector.js';

const tempDirs: string[] = [];

afterEach(async () => {
  clearRegistryCache();
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true }))
  );
});

describe('Runbook Selector', () => {
  it('matches request_not_effective for missing side effects', async () => {
    const result = await selectRunbook({
      context_id: 'ord-123',
      context_type: 'order_id',
      symptom: 'order created but downstream task missing',
      expected: 'task should be created',
    });

    expect(result.selected).toBe('request_not_effective');
    const candidate = result.candidates.find((item) => item.name === 'request_not_effective');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThan(0);
  });

  it('matches cache_stale for stale cache signals', async () => {
    const result = await selectRunbook({
      context_id: 'task-456',
      context_type: 'task_id',
      symptom: 'returned state does not match persistence, cache appears stale',
      expected: 'task should return the latest state',
    });

    expect(result.selected).toBe('cache_stale');
    const candidate = result.candidates.find((item) => item.name === 'cache_stale');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThan(0);
  });

  it('matches state_abnormal for status mismatch signals', async () => {
    const result = await selectRunbook({
      context_id: 'task-789',
      context_type: 'task_id',
      symptom: 'status is incorrect, stuck in processing',
      expected: 'status should be finished',
    });

    expect(result.selected).toBe('state_abnormal');
    const candidate = result.candidates.find((item) => item.name === 'state_abnormal');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThan(0);
  });

  it('returns a fallback candidate set when signals are weak', async () => {
    const result = await selectRunbook({
      context_id: 'user-000',
      context_type: 'user_id',
      symptom: 'system is broken',
      expected: 'system works fine',
    });

    expect(result.selected).toBeDefined();
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('loads configured custom runbooks', async () => {
    const customRunbookPath = await createCustomRunbook({
      name: 'asset_detail_incorrect',
      selector: {
        name: 'asset_detail_incorrect',
        priority: 10,
        context_types: ['order_id'],
        positive_signals: [
          { pattern: 'asset detail', weight: 6 },
          { pattern: 'returned incorrect', weight: 4 },
        ],
        negative_signals: [],
      },
    });

    const result = await selectRunbook({
      context_id: 'asset_123',
      context_type: 'order_id',
      symptom: 'asset detail returned incorrect data',
      expected: 'asset detail should match the persisted source of truth',
    }, [customRunbookPath]);

    expect(result.selected).toBe('asset_detail_incorrect');
  });
});

async function createCustomRunbook(input: {
  name: string;
  selector: Record<string, unknown>;
}): Promise<string> {
  const dirPath = await mkdtemp(path.join(os.tmpdir(), 'agent-debugger-runbook-'));
  tempDirs.push(dirPath);

  const runbookPath = path.join(dirPath, `${input.name}.yaml`);
  await writeFile(runbookPath, `name: ${input.name}\nsteps: []\n`, 'utf8');
  await writeFile(
    path.join(dirPath, `${input.name}.selector.json`),
    JSON.stringify(input.selector, null, 2),
    'utf8',
  );

  return runbookPath;
}
