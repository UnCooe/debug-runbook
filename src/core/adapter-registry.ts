import type { AgentDebuggerConfig, AdapterResult, IncidentInput } from '../types/index.js';

export interface RunbookStep {
  id: string;
  tool: string;
  required: boolean;
  purpose: string;
  params?: {
    table?: string;
    match_column?: string;
    key_template?: string;
    trace_ref_column?: string;
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
  adapterHandlers.push(handler);
}

export function getAdapterHandler(tool: string): AdapterHandler | undefined {
  return adapterHandlers.find((handler) => tool.startsWith(handler.prefix));
}

export function makeStepErrorResult(message: string): StepExecutionResult {
  return { ok: false, source: 'derived', evidence: [], errors: [message] };
}
