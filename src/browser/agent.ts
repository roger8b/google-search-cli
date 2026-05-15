// src/browser/agent.ts
// Wrapper for agent-browser CLI calls.

import { spawnSync } from 'node:child_process';

export interface AgentBrowserOptions {
  allowFailure?: boolean;
}

export function runAgentBrowser(
  bin: string,
  args: string[],
  port: number,
  options: AgentBrowserOptions = {}
): string {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}${stderr}`.trim();

  if (result.status !== 0 && !options.allowFailure) {
    if (output) process.stdout.write(`${output}\n`);
    throw new Error(`agent-browser ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return output;
}

export function runMaybe(
  bin: string,
  args: string[],
  port: number,
  options: AgentBrowserOptions = { allowFailure: true }
): string {
  return runAgentBrowser(bin, args, port, options);
}

export function buildCdpArgs(bin: string, port: number, args: string[]): string[] {
  return ['--cdp', String(port), ...args];
}