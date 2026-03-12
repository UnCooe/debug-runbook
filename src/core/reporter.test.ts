import { describe, it, expect } from 'vitest';
import { determineConclusion, buildReport } from './reporter.js';
import type { EvidenceItem } from '../types/index.js';

const mockDecision = {
  name: "test_runbook",
  rules: [
    {
      id: "rule-1",
      all: ["cache_stale", "db_row_found"],
      conclusion: "cache_stale_data_found",
      confidence: 0.9,
      root_cause: "缓存未刷新"
    }
  ],
  fallback: {
    conclusion: "unknown_issue",
    confidence: 0.2
  }
};

describe('Reporter Engine', () => {
  it('应当匹配给定规则 (all 条件全满足)', () => {
    const evidence: EvidenceItem[] = [
      { finding_type: 'cache_stale' } as EvidenceItem,
      { finding_type: 'db_row_found' } as EvidenceItem,
      { finding_type: 'irrelevant_finding' } as EvidenceItem
    ];

    const result = determineConclusion(mockDecision as any, evidence);
    expect(result.rule_id).toBe('rule-1');
    expect(result.conclusion).toBe('cache_stale_data_found');
    expect(result.confidence).toBe(0.9);
  });

  it('应当使用 fallback (all 条件不满足时)', () => {
    const evidence: EvidenceItem[] = [
      { finding_type: 'cache_stale' } as EvidenceItem
      // 缺少 db_row_found
    ];

    const result = determineConclusion(mockDecision as any, evidence);
    expect(result.rule_id).toBe('fallback');
    expect(result.conclusion).toBe('unknown_issue');
    expect(result.confidence).toBe(0.2);
  });

  it('应当正确构建 IncidentReport', () => {
    const evidence: EvidenceItem[] = [
      { id: '1', finding_type: 'cache_stale', summary: 'cache is stale' } as EvidenceItem
    ];
    const decisionResult = {
      conclusion: 'unknown_issue',
      confidence: 0.2,
      rule_id: 'fallback',
      root_cause: '未知原因',
      alternative_hypotheses: [],
      recommended_next_actions: []
    };
    
    const report = buildReport(
      { context_id: 'ctx-1', context_type: 'order_id', symptom: 'issue', expected: 'ok' },
      'test_runbook',
      mockDecision as any,
      evidence,
      decisionResult
    );

    expect(report.incident_summary).toContain('issue');
    expect(report.selected_runbook).toBe('test_runbook');
    expect(report.primary_conclusion).toBe('unknown_issue');
    expect(report.confidence).toBe(0.2);
    expect(report.evidence).toHaveLength(1);
    expect(report.confirmed_facts).toBeDefined();
  });
});
