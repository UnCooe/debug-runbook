#!/usr/bin/env node
// agent-debugger MCP Server
// 对外只暴露一个工具：investigate
// 封装完整的 runbook 选择 → adapter 调用 → 证据聚合 → 报告生成流程
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
  '对后端事故进行 Runbook 驱动的自动调查，返回结构化事故报告（根因、证据、下一步建议）。',
  {
    context_id: z.string().describe('可追踪的上下文标识符，如 trace_id、order_id、request_id'),
    context_type: z.enum([
      'trace_id', 'request_id', 'order_id', 'task_id', 'message_id', 'user_id',
    ]).describe('context_id 的类型'),
    symptom: z.string().describe('当前观察到的异常现象，尽量具体'),
    expected: z.string().describe('正常情况下应有的行为或状态'),
  },
  async ({ context_id, context_type, symptom, expected }) => {
    // 1. 校验输入
    const incident = IncidentInputSchema.parse({ context_id, context_type, symptom, expected });

    // 2. 加载配置
    const config = await loadConfig();

    // 3. 选择 Runbook
    const selection = await selectRunbook(incident);

    // 4. 执行 Runbook → 生成报告
    const report = await executeRunbook({
      incident,
      config,
      selectedRunbook: selection.selected,
    });

    // 5. 返回 MCP 内容块
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

// 启动 MCP Server（stdio 模式，兼容 Claude Desktop / OpenClaw 等）
const transport = new StdioServerTransport();
await server.connect(transport);
