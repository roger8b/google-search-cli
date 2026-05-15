// src/human/keyboard.ts
// Human-like typing simulation with typo correction and natural pauses.

import { runAgentBrowser } from '../browser/agent.js';
import { humanDelay } from './utils.js';
import { randInt } from './utils.js';
import { Config } from '../config/index.js';

function typingDelay(config: Config, minMs: number, maxMs: number): Promise<void> {
  const scaledMin = Math.max(1, Math.round(minMs * config.typeDelayScale));
  const scaledMax = Math.max(scaledMin, Math.round(maxMs * config.typeDelayScale));
  return humanDelay(scaledMin, scaledMax);
}

export async function humanType(
  bin: string,
  port: number,
  text: string,
  searchBoxRef: string,
  config: Config
): Promise<void> {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const typoChance = Math.random();
    const pauseChance = Math.random();

    // Simulate occasional typos
    if (typoChance < 0.015 && i > 2 && i < text.length - 1) {
      const wrongChar = 'abcdefghijklmnopqrstuvwxyz'[randInt(0, 25)];
      runAgentBrowser(bin, ['--cdp', String(port), 'keyboard', 'type', wrongChar], port);
      await typingDelay(config, 60, 150);
      runAgentBrowser(bin, ['--cdp', String(port), 'press', 'Backspace'], port);
      await typingDelay(config, 45, 120);
    }

    runAgentBrowser(bin, ['--cdp', String(port), 'keyboard', 'type', ch], port);

    // Occasional mouse drift (fake cursor jump)
    if (ch === ' ' && Math.random() < 0.12) {
      const driftX = randInt(140, 1100);
      const driftY = randInt(120, 620);
      runAgentBrowser(bin, ['--cdp', String(port), 'mouse', 'move', String(driftX), String(driftY)], port);
      await humanDelay(20, 70);
      await humanMoveToRef(bin, port, searchBoxRef);
    }

    if (pauseChance < 0.05) {
      await typingDelay(config, 120, 360);
    } else {
      await typingDelay(config, 28, 95);
    }
  }

  await typingDelay(config, 90, 260);
}

async function humanMoveToRef(bin: string, port: number, ref: string): Promise<void> {
  const { humanMoveTo } = await import('./mouse.js');
  await humanMoveTo(bin, port, ref);
}