// 配置加载器 - 支持 YAML 配置文件 + 环境变量插值
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentDebuggerConfigSchema, type AgentDebuggerConfig } from '../types/index.js';

const DEFAULT_CONFIG_PATHS = [
  'agent-debugger.config.yaml',
  'agent-debugger.config.yml',
];

/**
 * 将字符串中 ${ENV_VAR} 替换为对应的环境变量值
 * 若环境变量不存在则保持原样（不抛出错误，生产中可能有默认值）
 */
function interpolateEnvVars(input: unknown): unknown {
  if (typeof input === 'string') {
    return input.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
      return process.env[varName.trim()] ?? input;
    });
  }
  if (Array.isArray(input)) {
    return input.map(interpolateEnvVars);
  }
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, interpolateEnvVars(v)])
    );
  }
  return input;
}

/**
 * 加载配置文件。
 * 搜索顺序：
 * 1. 环境变量 AGENT_DEBUGGER_CONFIG 指定的路径
 * 2. 当前工作目录下的默认路径
 * 3. 若均未找到，返回空配置（仅使用内置 runbook）
 */
export async function loadConfig(cwd = process.cwd()): Promise<AgentDebuggerConfig> {
  const configPath = process.env['AGENT_DEBUGGER_CONFIG']
    ? path.resolve(process.env['AGENT_DEBUGGER_CONFIG'])
    : await findDefaultConfig(cwd);

  if (!configPath) {
    // 未找到配置文件，使用默认空配置（内置 runbook 仍然可用）
    return AgentDebuggerConfigSchema.parse({});
  }

  const raw = await readFile(configPath, 'utf-8');
  const parsed = parseYaml(raw);
  const interpolated = interpolateEnvVars(parsed);

  return AgentDebuggerConfigSchema.parse(interpolated);
}

async function findDefaultConfig(cwd: string): Promise<string | null> {
  for (const name of DEFAULT_CONFIG_PATHS) {
    const fullPath = path.join(cwd, name);
    try {
      await access(fullPath);
      return fullPath;
    } catch {
      // 文件不存在，继续尝试下一个
    }
  }
  return null;
}
