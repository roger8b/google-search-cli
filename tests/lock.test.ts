// tests/lock.test.ts
// Verifies the per-port mutex: acquires, blocks, reaps dead pids, times out.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { acquireLock } from '../src/lock.js';

const cleanup: number[] = [];
afterEach(() => {
  for (const port of cleanup) {
    const p = path.join(os.tmpdir(), `google-search-script-${port}.lock`);
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  cleanup.length = 0;
});

function randomPort(): number {
  // Stay above 60000 so we never collide with a real CDP run.
  return 60000 + Math.floor(Math.random() * 5000);
}

describe('acquireLock', () => {
  it('acquires when no holder exists', async () => {
    const port = randomPort(); cleanup.push(port);
    const release = await acquireLock({ port, waitMs: 1000, pollMs: 50 });
    expect(fs.existsSync(path.join(os.tmpdir(), `google-search-script-${port}.lock`))).toBe(true);
    release();
    expect(fs.existsSync(path.join(os.tmpdir(), `google-search-script-${port}.lock`))).toBe(false);
  });

  it('reaps a lock owned by a dead pid', async () => {
    const port = randomPort(); cleanup.push(port);
    const lockPath = path.join(os.tmpdir(), `google-search-script-${port}.lock`);
    // Write a fake lock owned by a definitely-dead pid.
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, ts: Date.now(), argv: [] }));
    const release = await acquireLock({ port, waitMs: 1000, pollMs: 50 });
    release();
  });

  it('times out when another live process holds the lock', async () => {
    const port = randomPort(); cleanup.push(port);
    const lockPath = path.join(os.tmpdir(), `google-search-script-${port}.lock`);
    // Use this test process's own pid so the kill(pid,0) probe returns alive.
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now(), argv: [] }));
    await expect(acquireLock({ port, waitMs: 200, pollMs: 50, staleMs: 60_000 })).rejects.toThrow(/lock timeout/);
    fs.unlinkSync(lockPath);
  });

  it('reaps a stale lock past staleMs', async () => {
    const port = randomPort(); cleanup.push(port);
    const lockPath = path.join(os.tmpdir(), `google-search-script-${port}.lock`);
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() - 10_000, argv: [] }));
    const release = await acquireLock({ port, waitMs: 500, pollMs: 50, staleMs: 1000 });
    release();
  });
});
