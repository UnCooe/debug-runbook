#!/usr/bin/env node
// agent-debugger MCP Server
// Exposes only one tool: investigate
// Encapsulates the complete flow: runbook selection -> adapter invocation -> evidence aggregation -> report generation
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../config/loader.js';
import { selectRunbook } from '../core/selector.js';
import { executeRunbook } from '../core/executor.js';
import { IncidentInputSchema } from '../types/index.js';

const server = new McpServer({
  name: 'agent-debugger',
  version: '0.1.0',
});

server.tool(
  'investigate',
  'Performs Runbook-driven automated investigation for backend incidents, returning a structured incident report (root cause, evidence, recommended next actions).',
  {
    context_id: z.string().describe('Traceable context identifier, such as trace_id, order_id, request_id'),
    context_type: z.enum([
      'trace_id', 'request_id', 'order_id', 'task_id', 'message_id', 'user_id',
    ]).describe('Type of context_id'),
    symptom: z.string().describe('Current observed abnormal phenomenon, be as specific as possible'),
    expected: z.string().describe('Expected behavior or state under normal conditions'),
  },
  async ({ context_id, context_type, symptom, expected }) => {
    // 1. Validate input
    const incident = IncidentInputSchema.parse({ context_id, context_type, symptom, expected });

    // 2. Load configuration
    const config = await loadConfig();

    // 3. Select Runbook
    const selection = await selectRunbook(incident, config.runbooks);
    if (!selection.candidates.some((candidate) => candidate.context_supported)) {
      throw new Error(`No configured runbook supports context_type "${context_type}".`);
    }

    // 4. Execute Runbook -> Generate report
    const report = await executeRunbook({
      incident,
      config,
      selectedRunbook: selection.selected,
      configuredRunbooks: config.runbooks,
    });

    // 5. Return MCP content block
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            runbook_selection: selection,
            report,
          }, null, 2),
        },
      ],
    };
  }
);

// Start MCP Server (stdio mode, compatible with Claude Desktop / OpenClaw, etc.)
const transport = new StdioServerTransport();
await server.connect(transport);
