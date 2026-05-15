// src/human/click.ts
// Human-like click simulation.

import { humanMoveTo } from './mouse.js';
import { humanDelay } from './utils.js';
import { runAgentBrowser } from '../browser/agent.js';

export async function humanClick(
  bin: string,
  port: number,
  ref: string
): Promise<void> {
  await humanMoveTo(bin, port, ref);
  await humanDelay(55, 160);
  runAgentBrowser(bin, ['--cdp', String(port), 'click', `@${ref}`], port);
  await humanDelay(70, 190);
}