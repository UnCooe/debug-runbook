import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeRunbook } from './executor.js';
import { runLangfuseAdapter } from '../adapters/langfuse/normalizer.js';
import { runDbAdapter } from '../adapters/db/normalizer.js';
import { runRedisAdapter } from '../adapters/redis/normalizer.js';

vi.mock('../adapters/langfuse/normalizer.js', () => ({
  runLangfuseAdapter: vi.fn(),
}));
vi.mock('../adapters/db/normalizer.js', () => ({
  runDbAdapter: vi.fn(),
}));
vi.mock('../adapters/redis/normalizer.js', () => ({
  runRedisAdapter: vi.fn(),
}));

vi.mock('../adapters/langfuse/client.js', () => ({
  LangfuseClient: class {},
}));
vi.mock('../adapters/db/client.js', () => ({
  DbReadonlyClient: class {
    close = vi.fn();
    query = vi.fn();
  },
}));
vi.mock('../adapters/redis/client.js', () => ({
  RedisClient: class {
    close = vi.fn();
  },
}));

const tempDirs: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true }))
  );
});

describe('Executor Engine', () => {
  it('runs the built-in cache_stale flow', async () => {
    vi.mocked(runLangfuseAdapter).mockResolvedValue({
      ok: true,
      source: 'trace',
      evidence: [
        { finding_type: 'trace_found', summary: 'Mock trace' } as any,
      ],
      errors: [],
      raw: null,
    });

    vi.mocked(runDbAdapter).mockResolvedValue({
      ok: true,
      source: 'db',
      evidence: [
        { finding_type: 'db_row_found', summary: 'Mock row' } as any,
      ],
      errors: [],
    });

    vi.mocked(runRedisAdapter).mockResolvedValue({
      ok: true,
      source: 'redis',
      evidence: [
        { finding_type: 'cache_key_exists', summary: 'Mock cache' } as any,
      ],
      errors: [],
      raw: null,
    });

    const report = await executeRunbook({
      incident: {
        context_id: 'task_123',
        context_type: 'task_id',
        symptom: 'cache is stale',
        expected: 'latest data should be returned',
      },
      config: {
        adapters: {
          langfuse: { base_url: '', public_key: '', secret_key: '', span_field_allowlist: [] },
          db: { type: 'postgres', connection_string: '', allowed_tables: [] },
          redis: { url: '', key_prefix_allowlist: [] },
        },
        runbooks: [],
      },
      selectedRunbook: 'cache_stale',
    });

    expect(report.incident_summary).toContain('cache is stale');
    expect(report.selected_runbook).toBe('cache_stale');
    expect(report.evidence.length).toBeGreaterThan(0);
    expect(report.primary_conclusion).toBeDefined();
    expect(runDbAdapter).toHaveBeenCalled();
    expect(runRedisAdapter).toHaveBeenCalled();
  });

  it('loads configured custom runbooks at execution time', async () => {
    const customRunbookPath = await createCustomRunbook('custom_cache_story');

    const report = await executeRunbook({
      incident: {
        context_id: 'custom-1',
        context_type: 'order_id',
        symptom: 'asset detail is wrong',
        expected: 'asset detail should match the source of truth',
      },
      config: {
        adapters: {},
        runbooks: [customRunbookPath],
      },
      selectedRunbook: 'custom_cache_story',
    });

    expect(report.selected_runbook).toBe('custom_cache_story');
    expect(report.primary_conclusion).toBe('custom_inconclusive');
    expect(report.matched_decision_rule).toBe('custom-fallback');
  });

  it('uses request_id-specific persistence and cache params for request_not_effective', async () => {
    vi.mocked(runDbAdapter).mockResolvedValue({
      ok: true,
      source: 'db',
      evidence: [],
      errors: [],
    });

    vi.mocked(runRedisAdapter).mockResolvedValue({
      ok: true,
      source: 'redis',
      evidence: [],
      errors: [],
      raw: null,
    });

    await executeRunbook({
      incident: {
        context_id: 'request_4041',
        context_type: 'request_id',
        symptom: 'user submitted a request but the order was never created',
        expected: 'the request should create an order record',
      },
      config: {
        adapters: {
          db: { type: 'postgres', connection_string: '', allowed_tables: [] },
          redis: { url: '', key_prefix_allowlist: [] },
        },
        runbooks: [],
      },
      selectedRunbook: 'request_not_effective',
    });

    expect(runDbAdapter).toHaveBeenCalledWith(expect.anything(), 'orders', 'request_id', 'request_4041', 'request_4041');
    expect(runRedisAdapter).toHaveBeenCalledWith(expect.anything(), 'idempotency:request_4041', 'request_4041');
  });

  it('uses task-specific persistence and cache params for state_abnormal', async () => {
    vi.mocked(runDbAdapter).mockResolvedValue({
      ok: true,
      source: 'db',
      evidence: [],
      errors: [],
    });

    vi.mocked(runRedisAdapter).mockResolvedValue({
      ok: true,
      source: 'redis',
      evidence: [],
      errors: [],
      raw: null,
    });

    await executeRunbook({
      incident: {
        context_id: 'task_777',
        context_type: 'task_id',
        symptom: 'task status is incorrect',
        expected: 'task status should be finished',
      },
      config: {
        adapters: {
          db: { type: 'postgres', connection_string: '', allowed_tables: [] },
          redis: { url: '', key_prefix_allowlist: [] },
        },
        runbooks: [],
      },
      selectedRunbook: 'state_abnormal',
    });

    expect(runDbAdapter).toHaveBeenCalledWith(expect.anything(), 'tasks', 'task_id', 'task_777', 'task_777');
    expect(runRedisAdapter).toHaveBeenCalledWith(expect.anything(), 'task:view:task_777', 'task_777');
  });

  it('throws when the selected runbook does not support the provided context type', async () => {
    await expect(executeRunbook({
      incident: {
        context_id: 'trace_123',
        context_type: 'trace_id',
        symptom: 'request did not create the expected side effect',
        expected: 'a task should be created',
      },
      config: {
        adapters: {},
        runbooks: [],
      },
      selectedRunbook: 'request_not_effective',
    })).rejects.toThrow('does not support context_type "trace_id"');
  });

  it('contains adapter exceptions as step errors instead of aborting the runbook', async () => {
    const customRunbookPath = await createCustomRunbook(
      'adapter_exception_story',
      [
        'name: adapter_exception_story',
        'steps:',
        '  - id: db_step',
        '    tool: db.lookup_entity',
        '    required: true',
        '    purpose: reproduce adapter exception handling',
      ].join('\n'),
    );

    vi.mocked(runDbAdapter).mockRejectedValue(new Error('db exploded'));

    const report = await executeRunbook({
      incident: {
        context_id: 'order_42',
        context_type: 'order_id',
        symptom: 'database adapter threw unexpectedly',
        expected: 'a report should still be produced',
      },
      config: {
        adapters: {
          db: { type: 'postgres', connection_string: '', allowed_tables: [] },
        },
        runbooks: [customRunbookPath],
      },
      selectedRunbook: 'adapter_exception_story',
    });

    expect(report.matched_decision_rule).toBe('custom-fallback');
    expect(report.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          finding_type: 'step_error',
          summary: expect.stringContaining('db exploded'),
        }),
      ]),
    );
  });
});

async function createCustomRunbook(name: string, yamlContent?: string): Promise<string> {
  const dirPath = await mkdtemp(path.join(os.tmpdir(), 'agent-debugger-runbook-'));
  tempDirs.push(dirPath);

  const runbookPath = path.join(dirPath, `${name}.yaml`);
  await writeFile(
    runbookPath,
    yamlContent ?? `name: ${name}\nsteps: []\n`,
    'utf8',
  );
  await writeFile(
    path.join(dirPath, `${name}.decision.json`),
    JSON.stringify({
      name,
      rules: [],
      fallback: {
        id: 'custom-fallback',
        conclusion: 'custom_inconclusive',
        confidence: 0.2,
        root_cause: 'Custom runbook fallback fired.',
      },
    }, null, 2),
    'utf8',
  );

  return runbookPath;
}
