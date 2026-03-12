import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRunbook } from './runbook-selector.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNBOOK_DIR = path.resolve(__dirname, '..', 'runbooks');
const ADAPTER_DIR = path.resolve(__dirname, '..', 'adapters');
const EVIDENCE_POLICY_DIR = path.resolve(__dirname, '..', 'evidence-policies');
const executionCache = new Map();
const decisionCache = new Map();
const normalizationCache = new Map();
let derivedPolicyCache = null;

export async function runCase(caseDir) {
  const manifest = await readJson(path.join(caseDir, 'manifest.json'));
  const selection = await selectRunbook(manifest.incident);
  const selectedRunbook = selection.selected;
  const expectedRunbook = manifest.expected?.runbook || manifest.runbook;
  const execution = await loadRunbookMetadata(selectedRunbook, 'execution', executionCache);
  const decision = await loadRunbookMetadata(selectedRunbook, 'decision', decisionCache);
  const operations = execution.operations || [];
  const rawResponses = {};
  let evidence = [];

  for (const operation of operations) {
    const response = await loadOperationResponse(caseDir, operation);
    rawResponses[operation] = response;
    const normalization = await loadNormalizationMetadata(operation);
    evidence = evidence.concat(normalizeEvidence(operation, response, manifest, normalization));
  }

  const derivedPolicy = await loadDerivedPolicy();
  evidence = evidence.concat(deriveCrossSourceEvidence(rawResponses, manifest, derivedPolicy));
  evidence = dedupeEvidence(evidence);

  const decisionResult = determineConclusion(decision, evidence);
  const report = buildReport(manifest, decision, evidence, decisionResult);

  return {
    manifest,
    selection,
    expectedRunbook,
    selectedRunbook,
    execution,
    decision,
    operations,
    rawResponses,
    evidence,
    primaryConclusion: decisionResult.conclusion,
    matchedDecisionRule: decisionResult.rule_id,
    report
  };
}

export function renderMarkdownReport(result) {
  const { manifest, report, primaryConclusion, evidence, selectedRunbook, expectedRunbook, selection, execution, matchedDecisionRule } = result;
  const evidenceLines = evidence.map((item) => `- [${item.source}] ${item.summary}`);
  const factLines = report.confirmed_facts.map((item) => `- ${item}`);
  const actionLines = report.recommended_next_actions.map((item, index) => `${index + 1}. ${item}`);
  const candidateLines = selection.candidates.map((item) => {
    const reason = item.matched_signals.length > 0 ? ` | signals: ${item.matched_signals.join(', ')}` : '';
    return `- ${item.name}: ${item.score}${reason}`;
  });
  const operationLines = (execution.operations || []).map((item) => `- ${item}`);

  return [
    `# ${manifest.title}`,
    '',
    '## Incident Input',
    `- context: ${manifest.incident.context_type}=${manifest.incident.context_id}`,
    `- symptom: ${manifest.incident.symptom}`,
    `- expected: ${manifest.incident.expected}`,
    '',
    '## Runbook Selection',
    `- selected: ${selectedRunbook}`,
    `- expected: ${expectedRunbook}`,
    ...candidateLines,
    '',
    '## Execution Plan',
    ...operationLines,
    '',
    '## Decision Rule',
    `- matched: ${matchedDecisionRule}`,
    '',
    '## Incident Summary',
    report.incident_summary,
    '',
    '## Confirmed Facts',
    ...factLines,
    '',
    '## Most Likely Root Cause',
    `${primaryConclusion}: ${report.most_likely_root_cause}`,
    '',
    '## Evidence',
    ...evidenceLines,
    '',
    '## Recommended Next Actions',
    ...actionLines,
    '',
    `Confidence: ${report.confidence}`
  ].join('\n');
}

async function loadRunbookMetadata(runbookName, kind, cache) {
  if (cache.has(runbookName)) {
    return cache.get(runbookName);
  }

  const filePath = path.join(RUNBOOK_DIR, `${runbookName}.${kind}.json`);
  const metadata = await readJson(filePath);
  cache.set(runbookName, metadata);
  return metadata;
}

async function loadNormalizationMetadata(operation) {
  if (normalizationCache.has(operation)) {
    return normalizationCache.get(operation);
  }

  const [adapterName] = operation.split('.');
  const filePath = path.join(ADAPTER_DIR, adapterName, `${operation}.normalization.json`);
  const metadata = await readJson(filePath);
  normalizationCache.set(operation, metadata);
  return metadata;
}

async function loadDerivedPolicy() {
  if (derivedPolicyCache) {
    return derivedPolicyCache;
  }

  derivedPolicyCache = await readJson(path.join(EVIDENCE_POLICY_DIR, 'derived-evidence.json'));
  return derivedPolicyCache;
}

function buildReport(manifest, decision, evidence, decisionResult) {
  const confirmedFacts = buildConfirmedFacts(decision, evidence);
  return {
    incident_summary: `${manifest.incident.symptom} Expected result: ${manifest.incident.expected}`,
    confirmed_facts: confirmedFacts,
    most_likely_root_cause: decisionResult.root_cause,
    alternative_hypotheses: decisionResult.alternative_hypotheses || [],
    evidence,
    recommended_next_actions: decisionResult.recommended_next_actions || [],
    confidence: decisionResult.confidence
  };
}

function buildConfirmedFacts(decision, evidence) {
  const facts = [];
  const templates = decision.confirmed_fact_templates || [];

  for (const template of templates) {
    if (hasFinding(evidence, template.finding_type)) {
      facts.push(template.text);
    }
  }

  for (const item of decision.default_confirmed_facts || []) {
    facts.push(item);
  }

  return dedupeStrings(facts);
}

function determineConclusion(decision, evidence) {
  for (const rule of decision.rules || []) {
    const allMatched = (rule.all || []).every((findingType) => hasFinding(evidence, findingType));
    if (allMatched) {
      return {
        rule_id: rule.id,
        conclusion: rule.conclusion,
        confidence: rule.confidence ?? 0.4,
        root_cause: rule.root_cause || 'The available evidence is insufficient to isolate a single root cause.',
        alternative_hypotheses: rule.alternative_hypotheses || [],
        recommended_next_actions: rule.recommended_next_actions || []
      };
    }
  }

  return {
    rule_id: decision.fallback?.id || 'fallback',
    conclusion: decision.fallback?.conclusion || 'investigation_inconclusive',
    confidence: decision.fallback?.confidence ?? 0.4,
    root_cause: decision.fallback?.root_cause || 'The available evidence is insufficient to isolate a single root cause.',
    alternative_hypotheses: decision.fallback?.alternative_hypotheses || [],
    recommended_next_actions: decision.fallback?.recommended_next_actions || []
  };
}

function deriveCrossSourceEvidence(rawResponses, manifest, policy) {
  const items = [];

  for (const rule of policy.rules || []) {
    const redisResponse = rawResponses['redis.inspect'];
    const dbResponse = rawResponses['db.readonly_query'] || rawResponses['db.lookup_entity'];

    if (!redisResponse?.ok || !dbResponse?.ok) {
      continue;
    }

    const redisStatus = getByPath(redisResponse, 'value_preview.status');
    const dbStatus = firstStatusFromRows(dbResponse.rows);

    if (!redisStatus || !dbStatus || redisStatus === dbStatus) {
      continue;
    }

    items.push(makeEvidence({
      id: `${manifest.case_id}-${rule.emit.id_suffix}`,
      source: rule.emit.source,
      entity_id: manifest.incident.context_id,
      timestamp: new Date().toISOString(),
      finding_type: rule.emit.finding_type,
      summary: renderTemplate(rule.emit.summary_template, { redis_status: redisStatus, db_status: dbStatus }),
      confidence: rule.emit.confidence,
      raw_ref: rule.emit.raw_ref,
      normalization_status: rule.emit.normalization_status
    }));
  }

  return items;
}

function firstStatusFromRows(rows) {
  if (!rows || typeof rows !== 'object') {
    return null;
  }
  for (const value of Object.values(rows)) {
    if (Array.isArray(value) && value[0] && typeof value[0].status === 'string') {
      return value[0].status;
    }
  }
  return null;
}

function normalizeEvidence(operation, response, manifest, normalization) {
  if (!response || !normalization) {
    return [];
  }

  const entityId = manifest.incident.context_id;
  const timestamp = new Date().toISOString();
  const rawRef = `${manifest.case_id}/${operation}.json`;

  if (normalization.cases) {
    const items = [];
    for (const caseRule of normalization.cases) {
      if (!matchesWhen(caseRule.when, response)) {
        continue;
      }

      for (const emitRule of caseRule.emit || []) {
        const normalized = normalizeEmitRule(emitRule, response, manifest, { entityId, timestamp, rawRef });
        items.push(...normalized);
      }
    }
    return items;
  }

  if (normalization.collection) {
    const collection = getByPath(response, normalization.collection.path) || [];
    return collection.map((item, index) => {
      const emit = normalization.collection.emit_per_item;
      return makeEvidence({
        id: `${manifest.case_id}-${renderTemplate(emit.id_suffix_template, { item, index: index + 1 })}`,
        source: emit.source,
        entity_id: entityId,
        timestamp,
        finding_type: emit.finding_type,
        summary: renderTemplate(emit.summary_template, { item, index: index + 1 }),
        confidence: emit.confidence,
        raw_ref: rawRef,
        ...pickFields(response, emit.fields),
        normalization_status: emit.normalization_status
      });
    });
  }

  if (normalization.table_rows) {
    const rows = getByPath(response, normalization.table_rows.path) || {};
    return Object.entries(rows).map(([table, value], index) => {
      const found = Array.isArray(value) && value.length > 0;
      return makeEvidence({
        id: `${manifest.case_id}-db-${table}-${index + 1}`,
        source: 'db',
        entity_id: entityId,
        timestamp,
        finding_type: found ? normalization.table_rows.found_finding_type : normalization.table_rows.missing_finding_type,
        summary: renderTemplate(found ? normalization.table_rows.found_summary_template : normalization.table_rows.missing_summary_template, { table }),
        confidence: normalization.table_rows.confidence,
        raw_ref: rawRef,
        [normalization.table_rows.field_name]: table,
        normalization_status: normalization.table_rows.normalization_status
      });
    });
  }

  return [];
}

function normalizeEmitRule(emitRule, response, manifest, context) {
  const items = [];

  if (emitRule.condition_path) {
    const conditionValue = Boolean(getByPath(response, emitRule.condition_path));
    items.push(makeEvidence({
      id: `${manifest.case_id}-${emitRule.id_suffix}`,
      source: emitRule.source,
      entity_id: context.entityId,
      timestamp: context.timestamp,
      finding_type: conditionValue ? emitRule.finding_type_true : emitRule.finding_type_false,
      summary: renderTemplate(conditionValue ? emitRule.summary_template_true : emitRule.summary_template_false, response),
      confidence: emitRule.confidence,
      raw_ref: context.rawRef,
      ...pickFields(response, emitRule.fields),
      normalization_status: emitRule.normalization_status
    }));
    return items;
  }

  if (emitRule.requires && !matchesRequires(emitRule.requires, response)) {
    return [];
  }

  items.push(makeEvidence({
    id: `${manifest.case_id}-${emitRule.id_suffix}`,
    source: emitRule.source,
    entity_id: context.entityId,
    timestamp: context.timestamp,
    finding_type: emitRule.finding_type,
    summary: renderTemplate(emitRule.summary_template, response),
    confidence: emitRule.confidence,
    raw_ref: context.rawRef,
    ...pickFields(response, emitRule.fields),
    normalization_status: emitRule.normalization_status
  }));
  return items;
}

function matchesWhen(when, response) {
  if (!when) {
    return true;
  }
  return Object.entries(when).every(([key, value]) => getByPath(response, key) === value);
}

function matchesRequires(requires, response) {
  if (requires.exists !== undefined && getByPath(response, 'exists') !== requires.exists) {
    return false;
  }
  if (requires.ttl_seconds_gt !== undefined && !(Number(getByPath(response, 'ttl_seconds')) > requires.ttl_seconds_gt)) {
    return false;
  }
  return true;
}

function pickFields(response, fields = []) {
  const result = {};
  for (const field of fields) {
    const value = getByPath(response, field);
    if (value !== undefined) {
      result[field] = value;
    }
  }
  return result;
}

function renderTemplate(template, data) {
  return String(template).replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
    const value = getByPath(data, key.trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

function getByPath(input, pathExpression) {
  if (!pathExpression) {
    return undefined;
  }
  return String(pathExpression).split('.').reduce((current, segment) => current?.[segment], input);
}

function dedupeEvidence(evidence) {
  const seen = new Set();
  return evidence.filter((item) => {
    const key = `${item.finding_type}:${item.summary}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeStrings(items) {
  return [...new Set(items)];
}

function hasFinding(evidence, findingType) {
  return evidence.some((item) => item.finding_type === findingType);
}

function makeEvidence(input) {
  return input;
}

async function loadOperationResponse(caseDir, operation) {
  const filePath = path.join(caseDir, `${operation}.json`);
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}
