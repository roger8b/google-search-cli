// src/lock.ts
// Process-level lock to serialize CDP access across concurrent invocations.
// Without this, parallel `run.sh` calls share the same Chrome tab and
// keystrokes from different queries interleave (e.g.
// "m atGr oa4oi gnvlisn..." = 3 queries typed simultaneously).

import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LockOptions {
  port: number;
  waitMs?: number;     // total time to wait for an existing lock (default 120000)
  pollMs?: number;     // interval between retries (default 500)
  staleMs?: number;    // consider lock stale if older than this (default 600000 = 10min)
}

interface LockData {
  pid: number;
  ts: number;
  argv: string[];
}

function lockPath(port: number): string {
  return join(tmpdir(), `google-search-script-${port}.lock`);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(path: string): LockData | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as LockData;
  } catch {
    return null;
  }
}

function tryAcquire(path: string): boolean {
  try {
    // O_EXCL via 'wx' flag: fails if file exists
    const fd = openSync(path, 'wx');
    const data: LockData = { pid: process.pid, ts: Date.now(), argv: process.argv.slice(2) };
    writeFileSync(fd, JSON.stringify(data));
    closeSync(fd);
    return true;
  } catch (e: unknown) {
    return false;
  }
}

function log(message: string): void {
  process.stderr.write(`[google-search] ${message}\n`);
}

/**
 * Acquire a lock for the given port. Blocks until acquired or `waitMs` elapses.
 * Returns a release callback. Throws on timeout or if disabled and another holds it.
 */
export async function acquireLock(opts: LockOptions): Promise<() => void> {
  const path = lockPath(opts.port);
  const waitMs = opts.waitMs ?? 120_000;
  const pollMs = opts.pollMs ?? 500;
  const staleMs = opts.staleMs ?? 600_000;
  const start = Date.now();
  let warned = false;

  while (true) {
    if (tryAcquire(path)) break;

    // Existing lock - check staleness / dead PID
    const existing = readLock(path);
    if (existing) {
      const age = Date.now() - existing.ts;
      if (!isPidAlive(existing.pid)) {
        log(`stale lock at ${path} (pid ${existing.pid} dead) - removing`);
        try { unlinkSync(path); } catch { /* race ok */ }
        continue;
      }
      if (age > staleMs) {
        log(`stale lock at ${path} (age ${Math.round(age / 1000)}s > ${Math.round(staleMs / 1000)}s) - removing`);
        try { unlinkSync(path); } catch { /* race ok */ }
        continue;
      }
      if (!warned) {
        log(`lock held by pid ${existing.pid} (age ${Math.round(age / 1000)}s); waiting up to ${Math.round(waitMs / 1000)}s`);
        warned = true;
      }
    }

    if (Date.now() - start > waitMs) {
      throw new Error(
        `lock timeout: ${path} held by pid ${existing?.pid ?? '?'} for ${Math.round((Date.now() - (existing?.ts ?? Date.now())) / 1000)}s. ` +
        `Use --no-lock to bypass (will likely interleave keystrokes with concurrent runs) or wait/kill the other process.`
      );
    }

    await new Promise<void>((r) => setTimeout(r, pollMs));
  }

  // Auto-release on process exit
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try { unlinkSync(path); } catch { /* already gone */ }
  };

  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(130); });
  process.on('SIGTERM', () => { release(); process.exit(143); });
  process.on('uncaughtException', (e) => {
    release();
    process.stderr.write(`[google-search] uncaughtException: ${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(1);
  });

  return release;
}
