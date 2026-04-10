import type { AgentDebuggerConfig, AdapterResult, IncidentInput } from '../types/index.js';

export interface RunbookStep {
  id: string;
  tool: string;
  required: boolean;
  purpose: string;
  params?: {
    table?: string;
    table_by_context_type?: Record<string, string>;
    match_column?: string;
    match_column_by_context_type?: Record<string, string>;
    key_template?: string;
    key_template_by_context_type?: Record<string, string>;
    trace_ref_column?: string;
    trace_ref_column_by_context_type?: Record<string, string>;
    trace_ref_table?: string;
    trace_ref_table_by_context_type?: Record<string, string>;
    trace_ref_match_column?: string;
    trace_ref_match_column_by_context_type?: Record<string, string>;
  };
}

export interface StepExecutionContext {
  incident: IncidentInput;
  config: AgentDebuggerConfig;
  step: RunbookStep;
}

export type StepExecutionResult = AdapterResult;

export interface AdapterHandler {
  prefix: string;
  run(ctx: StepExecutionContext): Promise<StepExecutionResult>;
}

const adapterHandlers: AdapterHandler[] = [];

export function registerAdapterHandler(handler: AdapterHandler): void {
  const existingIndex = adapterHandlers.findIndex((item) => item.prefix === handler.prefix);
  if (existingIndex >= 0) {
    adapterHandlers[existingIndex] = handler;
    return;
  }
  adapterHandlers.push(handler);
}

export function getAdapterHandler(tool: string): AdapterHandler | undefined {
  return adapterHandlers.find((handler) => tool.startsWith(handler.prefix));
}

export function makeStepErrorResult(message: string): StepExecutionResult {
  return { ok: false, source: 'derived', evidence: [], errors: [message] };
}
