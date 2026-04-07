import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './loader.js';

const ENV_KEYS = [
  'AGENT_DEBUGGER_CONFIG',
  'TEST_DB_USER',
  'TEST_DB_PASS',
];

const originalEnv = new Map(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

const tempDirs: string[] = [];

afterEach(async () => {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  await Promise.all(
    tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true }))
  );
});

describe('Config Loader', () => {
  it('keeps missing placeholders intact while interpolating existing env vars', async () => {
    process.env.TEST_DB_USER = 'alice';
    delete process.env.TEST_DB_PASS;

    const configDir = await createTempConfigDir(`
adapters:
  db:
    connection_string: postgres://\${TEST_DB_USER}:\${TEST_DB_PASS}@localhost:5432/app
`);

    const config = await loadConfig(configDir);

    expect(config.adapters.db?.connection_string).toBe(
      'postgres://alice:${TEST_DB_PASS}@localhost:5432/app'
    );
  });

  it('resolves custom runbook paths relative to the config file', async () => {
    const configDir = await createTempConfigDir(`
runbooks:
  - ./team-runbooks/order-task-missing.yaml
`);

    const config = await loadConfig(configDir);

    expect(config.runbooks).toEqual([
      path.join(configDir, 'team-runbooks', 'order-task-missing.yaml'),
    ]);
  });
});

async function createTempConfigDir(content: string): Promise<string> {
  const dirPath = await mkdtemp(path.join(os.tmpdir(), 'agent-debugger-config-'));
  tempDirs.push(dirPath);

  await writeFile(path.join(dirPath, 'agent-debugger.config.yaml'), content, 'utf8');
  return dirPath;
}
