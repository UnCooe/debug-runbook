export interface DecisionRule {
  id: string;
  all?: string[];
  conclusion: string;
  confidence: number;
  root_cause?: string;
  alternative_hypotheses?: string[];
  recommended_next_actions?: string[];
}

export interface ConfirmedFactTemplate {
  finding_type: string;
  text: string;
}

export interface DecisionFallback {
  id?: string;
  conclusion: string;
  confidence: number;
  root_cause?: string;
  alternative_hypotheses?: string[];
  recommended_next_actions?: string[];
}

export interface DecisionMetadata {
  name: string;
  confirmed_fact_templates?: ConfirmedFactTemplate[];
  default_confirmed_facts?: string[];
  rules?: DecisionRule[];
  fallback?: DecisionFallback;
}
