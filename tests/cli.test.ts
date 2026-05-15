// tests/cli.test.ts
// Smoke tests for the legacy parseCli — guards the most commonly used flags
// while we keep parseCli around (Commander migration is deferred).

import { describe, it, expect } from 'vitest';
import { parseCli } from '../src/cli/index.js';

describe('parseCli', () => {
  it('accepts a positional query', () => {
    const cfg = parseCli(['hello world']);
    expect(cfg.searchQuery).toBe('hello world');
  });

  it('accepts --query / -q', () => {
    const cfg = parseCli(['-q', 'foo bar']);
    expect(cfg.searchQuery).toBe('foo bar');
  });

  it('parses --ai-mode and --ai as aliases', () => {
    expect(parseCli(['x', '--ai-mode']).aiMode).toBe(true);
    expect(parseCli(['x', '--ai']).aiMode).toBe(true);
  });

  it('collects repeated --follow-up', () => {
    const cfg = parseCli(['x', '-c', '-f', 'a', '-f', 'b']);
    expect(cfg.conversation).toBe(true);
    expect(cfg.followUps).toEqual(['a', 'b']);
  });

  it('parses retry/history/cache/merge flags', () => {
    const cfg = parseCli([
      'x',
      '--retry', '--max-retries', '5',
      '--no-history',
      '--use-cache', '--cache-ttl', '30',
      '--merge-history', '--merge-limit', '3', '--merge-ttl', '60',
      '--no-lock', '--lock-wait', '10',
    ]);
    expect(cfg.retry).toBe(true);
    expect(cfg.maxRetries).toBe(5);
    expect(cfg.noHistory).toBe(true);
    expect(cfg.useCache).toBe(true);
    expect(cfg.cacheTtlSeconds).toBe(30);
    expect(cfg.mergeHistory).toBe(true);
    expect(cfg.mergeLimit).toBe(3);
    expect(cfg.mergeTtlSeconds).toBe(60);
    expect(cfg.noLock).toBe(true);
    expect(cfg.lockWaitSeconds).toBe(10);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/Unknown option/);
  });

  it('rejects invalid --format', () => {
    expect(() => parseCli(['x', '--format', 'yaml'])).toThrow(/Invalid --format/);
  });
});
