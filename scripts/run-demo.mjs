import path from 'node:path';
import { runCase, renderMarkdownReport } from './demo-lib.mjs';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: tsx scripts/run-demo.mjs <case-directory>');
  process.exit(1);
}

const caseDir = path.resolve(process.cwd(), inputPath);
const result = await runCase(caseDir);

console.log(renderMarkdownReport(result));
console.log('\n## JSON Report');
console.log(JSON.stringify(result.report, null, 2));
