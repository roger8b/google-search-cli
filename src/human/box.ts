// src/human/box.ts
// Box detection utilities for element positioning.

import { runAgentBrowser } from '../browser/agent.js';

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function parseBoxValue(raw: string, label: string): number {
  const cleaned = stripAnsi(raw);
  const line = cleaned
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${label}:`));

  if (!line) {
    throw new Error(`Could not parse ${label} from box output: ${JSON.stringify(cleaned)}`);
  }

  const value = line.split(':', 2)[1]?.trim();
  if (!value) {
    throw new Error(`Missing ${label} value in box output: ${JSON.stringify(cleaned)}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} value in box output: ${JSON.stringify(cleaned)}`);
  }

  return Math.trunc(parsed);
}

export function getBox(
  bin: string,
  port: number,
  ref: string
): { x: number; y: number; width: number; height: number } {
  const output = runAgentBrowser(bin, ['--cdp', String(port), 'get', 'box', `@${ref}`], port);
  const x = parseBoxValue(output, 'x');
  const y = parseBoxValue(output, 'y');
  const width = parseBoxValue(output, 'width');
  const height = parseBoxValue(output, 'height');
  return { x, y, width, height };
}