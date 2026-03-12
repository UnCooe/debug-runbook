import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { runCase } from './demo-lib.mjs';

const casesRoot = path.resolve(process.cwd(), 'fixtures/cases');
const caseNames = await readdir(casesRoot, { withFileTypes: true });
const caseDirs = caseNames.filter((entry) => entry.isDirectory()).map((entry) => path.join(casesRoot, entry.name));

const results = [];

for (const caseDir of caseDirs) {
  const result = await runCase(caseDir);
  const expected = result.manifest.expected;
  const findingTypes = new Set(result.evidence.map((item) => item.finding_type));
  const missingFindingTypes = expected.required_finding_types.filter((item) => !findingTypes.has(item));
  const runbookMatched = result.selectedRunbook === expected.runbook;
  const conclusionMatched = result.primaryConclusion === expected.primary_conclusion;

  results.push({
    case_id: result.manifest.case_id,
    difficulty: result.manifest.difficulty || 'normal',
    expected_runbook: expected.runbook,
    actual_runbook: result.selectedRunbook,
    runbook_matched: runbookMatched,
    expected_conclusion: expected.primary_conclusion,
    actual_conclusion: result.primaryConclusion,
    conclusion_matched: conclusionMatched,
    missing_finding_types: missingFindingTypes,
    confidence: result.report.confidence
  });
}

const passed = results.filter((item) => item.runbook_matched && item.conclusion_matched && item.missing_finding_types.length === 0).length;
const runbookPass = results.filter((item) => item.runbook_matched).length;
const conclusionPass = results.filter((item) => item.conclusion_matched).length;
const hardCases = results.filter((item) => item.difficulty === 'hard');
const hardPassed = hardCases.filter((item) => item.runbook_matched && item.conclusion_matched && item.missing_finding_types.length === 0).length;

console.log('# Benchmark Summary');
console.log('');
for (const item of results) {
  console.log(`- ${item.case_id}: difficulty=${item.difficulty} runbook_match=${item.runbook_matched} conclusion_match=${item.conclusion_matched} missing_findings=${item.missing_finding_types.length} confidence=${item.confidence}`);
}
console.log('');
console.log(`Runbook selection pass rate: ${runbookPass}/${results.length}`);
console.log(`Conclusion pass rate: ${conclusionPass}/${results.length}`);
console.log(`Overall pass rate: ${passed}/${results.length}`);
if (hardCases.length > 0) {
  console.log(`Hard-case pass rate: ${hardPassed}/${hardCases.length}`);
}
console.log('');
console.log(JSON.stringify(results, null, 2));
