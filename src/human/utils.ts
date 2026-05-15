// src/human/utils.ts
// Random utility functions for human-like behavior.

export function randInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generic pause used outside typing; keeps visual flow without stalling.
export async function humanDelay(minMs: number, maxMs: number): Promise<void> {
  await sleep(randInt(minMs, maxMs));
}