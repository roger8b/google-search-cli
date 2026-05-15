// tests/options.test.ts
// Exercises the Commander-driven search subcommand: option parsing into a
// Config, alias rewriting, --no-* flags, repeatable -f, and rejected input.

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { applySearchOptions, optsToConfig } from '../src/cli/options.js';
import type { Config } from '../src/config/index.js';

function parse(args: string[]): { positional: string | undefined; config: Config } {
  let positional: string | undefined;
  let captured: Record<string, unknown> = {};
  const program = new Command();
  program.exitOverride();
  const cmd = program.command('search [query]').action((q, opts) => {
    positional = q;
    captured = opts;
  });
  applySearchOptions(cmd);
  program.parse(['node', 'gscli', 'search', ...args], { from: 'node' });
  return { positional, config: optsToConfig(positional, captured) };
}

describe('search options → Config', () => {
  it('accepts a positional query', () => {
    const { config } = parse(['hello world']);
    expect(config.searchQuery).toBe('hello world');
  });

  it('accepts --query / -q', () => {
    expect(parse(['-q', 'foo']).config.searchQuery).toBe('foo');
    expect(parse(['--query', 'bar']).config.searchQuery).toBe('bar');
  });

  it('--ai-mode sets aiMode', () => {
    expect(parse(['x', '--ai-mode']).config.aiMode).toBe(true);
  });

  it('collects repeated --follow-up', () => {
    const { config } = parse(['x', '-c', '-f', 'a', '-f', 'b']);
    expect(config.conversation).toBe(true);
    expect(config.followUps).toEqual(['a', 'b']);
  });

  it('parses numeric flags', () => {
    const { config } = parse([
      'x',
      '--port', '9223',
      '--max-links', '7',
      '--type-delay-scale', '0.5',
      '--max-retries', '5',
      '--cache-ttl', '30',
      '--merge-limit', '3',
      '--merge-ttl', '60',
      '--lock-wait', '10',
    ]);
    expect(config.port).toBe(9223);
    expect(config.maxLinks).toBe(7);
    expect(config.typeDelayScale).toBe(0.5);
    expect(config.maxRetries).toBe(5);
    expect(config.cacheTtlSeconds).toBe(30);
    expect(config.mergeLimit).toBe(3);
    expect(config.mergeTtlSeconds).toBe(60);
    expect(config.lockWaitSeconds).toBe(10);
  });

  it('handles --no-history and --no-lock', () => {
    const { config } = parse(['x', '--no-history', '--no-lock']);
    expect(config.noHistory).toBe(true);
    expect(config.noLock).toBe(true);
  });

  it('--retry, --use-cache, --merge-history flip flags', () => {
    const { config } = parse(['x', '--retry', '--use-cache', '--merge-history']);
    expect(config.retry).toBe(true);
    expect(config.useCache).toBe(true);
    expect(config.mergeHistory).toBe(true);
  });

  it('rejects invalid --format', () => {
    expect(() => parse(['x', '--format', 'yaml'])).toThrow(/Invalid --format/);
  });

  it('rejects invalid --max-links (non-positive)', () => {
    expect(() => parse(['x', '--max-links', '0'])).toThrow(/Invalid --max-links/);
  });

  it('rejects unknown options', () => {
    expect(() => parse(['x', '--bogus'])).toThrow();
  });
});
