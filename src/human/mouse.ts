// src/human/mouse.ts
// Human-like mouse movement using bezier curves.

import { runAgentBrowser } from '../browser/agent.js';
import { getBox } from './box.js';
import { humanDelay } from './utils.js';
import { randInt } from './utils.js';

type Point = [number, number];

export async function humanMoveTo(
  bin: string,
  port: number,
  ref: string
): Promise<void> {
  const box = getBox(bin, port, ref);
  const targetX = box.x + Math.floor(box.width / 2) + randInt(-4, 4);
  const targetY = box.y + Math.floor(box.height / 2) + randInt(-3, 3);

  const startX = box.x + randInt(80, 220);
  const startY = box.y + box.height + randInt(50, 180);

  const overshootX = targetX + randInt(10, 24) * (Math.random() < 0.5 ? -1 : 1);
  const overshootY = targetY + randInt(6, 18) * (Math.random() < 0.5 ? -1 : 1);
  const ctrlX = (startX + targetX) / 2 + randInt(-90, 90);
  const ctrlY = (startY + targetY) / 2 + randInt(-70, 70);

  const points: Point[] = [];
  const steps = randInt(10, 18);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const inv = 1 - t;
    const x = Math.round(inv * inv * startX + 2 * inv * t * ctrlX + t * t * overshootX + randInt(-2, 2));
    const y = Math.round(inv * inv * startY + 2 * inv * t * ctrlY + t * t * overshootY + randInt(-2, 2));
    points.push([x, y]);
  }
  points.push([targetX, targetY]);

  for (const [x, y] of points) {
    runAgentBrowser(bin, ['--cdp', String(port), 'mouse', 'move', String(x), String(y)], port);
    await humanDelay(16, 58);
  }

  await humanDelay(35, 110);
}