// Incident Reporter - Generates final incident report from decision results and evidence
import type { EvidenceItem, IncidentInput, IncidentReport } from '../types/index.js';

interface DecisionRule {
  id: string;
  all?: string[];
  conclusion: string;
  confidence: number;
  root_cause?: string;
  alternative_hypotheses?: string[];
  recommended_next_actions?: string[];
}

interface ConfirmedFactTemplate {
  finding_type: string;
  text: string;
}

interface DecisionMetadata {
  name: string;
  confirmed_fact_templates?: ConfirmedFactTemplate[];
  default_confirmed_facts?: string[];
  rules?: DecisionRule[];
  fallback?: {
    id?: string;
    conclusion: string;
    confidence: number;
    root_cause?: string;
    alternative_hypotheses?: string[];
    recommended_next_actions?: string[];
  };
}

export interface DecisionResult {
  rule_id: string;
  conclusion: string;
  confidence: number;
  root_cause: string;
  alternative_hypotheses: string[];
  recommended_next_actions: string[];
}

/**
 * Determine final conclusion based on decision metadata and evidence list
 */
export function determineConclusion(
  decision: DecisionMetadata,
  evidence: EvidenceItem[],
): DecisionResult {
  const findingTypes = new Set(evidence.map((e) => e.finding_type));

  for (const rule of decision.rules ?? []) {
    const allMatched = (rule.all ?? []).every((ft) => findingTypes.has(ft));
    if (allMatched) {
      return {
        rule_id: rule.id,
        conclusion: rule.conclusion,
        confidence: rule.confidence ?? 0.4,
        root_cause: rule.root_cause ?? 'Current evidence is insufficient to isolate a single root cause.',
        alternative_hypotheses: rule.alternative_hypotheses ?? [],
        recommended_next_actions: rule.recommended_next_actions ?? [],
      };
    }
  }

  // None of the rules matched, use fallback
  return {
    rule_id: decision.fallback?.id ?? 'fallback',
    conclusion: decision.fallback?.conclusion ?? 'investigation_inconclusive',
    confidence: decision.fallback?.confidence ?? 0.4,
    root_cause: decision.fallback?.root_cause ?? 'Current evidence is insufficient to isolate a single root cause.',
    alternative_hypotheses: decision.fallback?.alternative_hypotheses ?? [],
    recommended_next_actions: decision.fallback?.recommended_next_actions ?? [],
  };
}

/**
 * Build the final IncidentReport
 */
export function buildReport(
  incident: IncidentInput,
  selectedRunbook: string,
  decision: DecisionMetadata,
  evidence: EvidenceItem[],
  decisionResult: DecisionResult,
): IncidentReport {
  const confirmedFacts = buildConfirmedFacts(decision, evidence);

  return {
    incident_summary: `${incident.symptom}. Expected behavior: ${incident.expected}`,
    selected_runbook: selectedRunbook,
    confirmed_facts: confirmedFacts,
    most_likely_root_cause: decisionResult.root_cause,
    primary_conclusion: decisionResult.conclusion,
    confidence: decisionResult.confidence,
    alternative_hypotheses: decisionResult.alternative_hypotheses,
    evidence,
    recommended_next_actions: decisionResult.recommended_next_actions,
    matched_decision_rule: decisionResult.rule_id,
    generated_at: new Date().toISOString(),
  };
}

function buildConfirmedFacts(decision: DecisionMetadata, evidence: EvidenceItem[]): string[] {
  const findingTypes = new Set(evidence.map((e) => e.finding_type));
  const facts: string[] = [];

  for (const tmpl of decision.confirmed_fact_templates ?? []) {
    if (findingTypes.has(tmpl.finding_type)) {
      facts.push(tmpl.text);
    }
  }
  for (const item of decision.default_confirmed_facts ?? []) {
    facts.push(item);
  }

  // Deduplicate
  return [...new Set(facts)];
}
