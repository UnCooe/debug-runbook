import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

export async function runChecks(root = process.cwd()) {
  const runbookDir = path.join(root, 'runbooks');
  const adapterDir = path.join(root, 'adapters');
  const evidencePolicyDir = path.join(root, 'evidence-policies');
  const fixturesDir = path.join(root, 'fixtures', 'cases');
  const failures = [];

  const runbookNames = await collectRunbookNames(runbookDir);
  const knownFindingTypes = new Set();

  for (const runbookName of runbookNames) {
    const selector = await loadJson(path.join(runbookDir, `${runbookName}.selector.json`), failures, true);
    const execution = await loadJson(path.join(runbookDir, `${runbookName}.execution.json`), failures, true);
    const decision = await loadJson(path.join(runbookDir, `${runbookName}.decision.json`), failures, true);

    if (!selector || !execution || !decision) {
      continue;
    }

    validateSelector(runbookName, selector, failures);
    validateExecution(runbookName, execution, failures);
    validateDecision(runbookName, decision, failures);
  }

  const normalizationFiles = await collectFiles(adapterDir, '.normalization.json');
  for (const filePath of normalizationFiles) {
    const metadata = await loadJson(filePath, failures, true);
    if (!metadata) {
      continue;
    }
    validateNormalization(filePath, metadata, failures);
    extractFindingTypesFromNormalization(metadata, knownFindingTypes);
  }

  const derivedPolicy = await loadJson(path.join(evidencePolicyDir, 'derived-evidence.json'), failures, true);
  if (derivedPolicy) {
    validateDerivedPolicy(derivedPolicy, failures);
    for (const rule of derivedPolicy.rules || []) {
      knownFindingTypes.add(rule.emit.finding_type);
    }
  }

  for (const runbookName of runbookNames) {
    const execution = await loadJson(path.join(runbookDir, `${runbookName}.execution.json`), failures, true);
    const decision = await loadJson(path.join(runbookDir, `${runbookName}.decision.json`), failures, true);
    if (!execution || !decision) {
      continue;
    }

    for (const operation of execution.operations || []) {
      const normalizationPath = path.join(adapterDir, operation.split('.')[0], `${operation}.normalization.json`);
      try {
        await readFile(normalizationPath, 'utf8');
      } catch {
        failures.push(`Missing normalization metadata for operation ${operation} used by runbook ${runbookName}.`);
      }
    }

    for (const template of decision.confirmed_fact_templates || []) {
      if (!knownFindingTypes.has(template.finding_type)) {
        failures.push(`Unknown finding_type ${template.finding_type} in confirmed_fact_templates for runbook ${runbookName}.`);
      }
    }

    for (const rule of decision.rules || []) {
      for (const findingType of rule.all || []) {
        if (!knownFindingTypes.has(findingType)) {
          failures.push(`Unknown finding_type ${findingType} in decision rule ${rule.id} for runbook ${runbookName}.`);
        }
      }
    }
  }

  await validateFixtures(fixturesDir, runbookNames, failures);
  return failures;
}

if (isDirectRun) {
  const failures = await runChecks();
  if (failures.length > 0) {
    console.error('# Check Failed');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Metadata check passed.');
}

async function collectRunbookNames(runbookDir) {
  const files = await readdir(runbookDir);
  return files.filter((name) => name.endsWith('.yaml')).map((name) => name.replace(/\.yaml$/, ''));
}

async function collectFiles(dirPath, suffix) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, suffix));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function validateFixtures(fixturesDir, runbookNames, failures) {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifest = await loadJson(path.join(fixturesDir, entry.name, 'manifest.json'), failures, true);
    if (!manifest) {
      continue;
    }
    if (!runbookNames.includes(manifest.expected?.runbook)) {
      failures.push(`Fixture ${entry.name} references unknown expected.runbook ${manifest.expected?.runbook}.`);
    }
    if (typeof manifest.expected?.primary_conclusion !== 'string') {
      failures.push(`Fixture ${entry.name} is missing expected.primary_conclusion.`);
    }
    if (!Array.isArray(manifest.expected?.required_finding_types)) {
      failures.push(`Fixture ${entry.name} is missing expected.required_finding_types.`);
    }
  }
}

function validateSelector(runbookName, selector, failures) {
  if (selector.name !== runbookName) {
    failures.push(`Selector name mismatch for ${runbookName}.selector.json.`);
  }
  if (!Array.isArray(selector.context_types) || selector.context_types.length === 0) {
    failures.push(`Selector for ${runbookName} must define context_types.`);
  }
  if (!Array.isArray(selector.positive_signals) || !Array.isArray(selector.negative_signals)) {
    failures.push(`Selector for ${runbookName} must define positive_signals and negative_signals.`);
  }
}

function validateExecution(runbookName, execution, failures) {
  if (execution.name !== runbookName) {
    failures.push(`Execution name mismatch for ${runbookName}.execution.json.`);
  }
  if (!Array.isArray(execution.operations) || execution.operations.length === 0) {
    failures.push(`Execution metadata for ${runbookName} must define at least one operation.`);
  }
}

function validateDecision(runbookName, decision, failures) {
  if (decision.name !== runbookName) {
    failures.push(`Decision name mismatch for ${runbookName}.decision.json.`);
  }
  if (!Array.isArray(decision.rules)) {
    failures.push(`Decision metadata for ${runbookName} must define rules.`);
  }
  if (!decision.fallback) {
    failures.push(`Decision metadata for ${runbookName} must define fallback.`);
  }
}

function validateNormalization(filePath, metadata, failures) {
  if (typeof metadata.operation !== 'string') {
    failures.push(`Normalization metadata ${filePath} must define operation.`);
  }
  if (!metadata.cases && !metadata.collection && !metadata.table_rows) {
    failures.push(`Normalization metadata ${filePath} must define cases, collection, or table_rows.`);
  }
}

function validateDerivedPolicy(policy, failures) {
  if (!Array.isArray(policy.rules)) {
    failures.push('Derived evidence policy must define rules.');
  }
}

function extractFindingTypesFromNormalization(metadata, knownFindingTypes) {
  if (metadata.cases) {
    for (const caseRule of metadata.cases) {
      for (const emit of caseRule.emit || []) {
        if (emit.finding_type) {
          knownFindingTypes.add(emit.finding_type);
        }
        if (emit.finding_type_true) {
          knownFindingTypes.add(emit.finding_type_true);
        }
        if (emit.finding_type_false) {
          knownFindingTypes.add(emit.finding_type_false);
        }
      }
    }
  }

  if (metadata.collection?.emit_per_item?.finding_type) {
    knownFindingTypes.add(metadata.collection.emit_per_item.finding_type);
  }

  if (metadata.table_rows) {
    knownFindingTypes.add(metadata.table_rows.found_finding_type);
    knownFindingTypes.add(metadata.table_rows.missing_finding_type);
  }
}

async function loadJson(filePath, failures, required = false) {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    failures.push(`${required ? 'Missing or invalid' : 'Invalid'} JSON file: ${filePath}`);
    return null;
  }
}
