import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runChecks } from './check.mjs';

const ROOT = process.cwd();
const targetPath = path.join(ROOT, 'runbooks', 'cache_stale.execution.json');
const backup = await readFile(targetPath, 'utf8');

const broken = JSON.stringify({
  name: 'cache_stale',
  operations: ['redis.inspect', 'db.readonly_query', 'mq.inspect']
}, null, 2);

try {
  await writeFile(targetPath, broken, 'utf8');
  const failures = await runChecks(ROOT);
  if (failures.length === 0) {
    console.error('Expected check to fail, but it passed.');
    process.exit(1);
  }
  console.log('# Expected Failure Demo');
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
  console.log('Intentional failure demo behaved as expected.');
} finally {
  await writeFile(targetPath, backup, 'utf8');
}
