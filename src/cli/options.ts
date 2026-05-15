// src/cli/options.ts
// Single source of truth for `gscli search` flags. Used by Commander to wire
// the search subcommand and by the root help to print the same options.

import { Command } from 'commander';
import { Config, DEFAULT_CONFIG } from '../config/index.js';

export interface SearchOptionDef {
  flags: string;
  description: string;
  defaultValue?: unknown;
  collect?: boolean;
}

// Order matches the legacy printHelp output so users with muscle memory still
// recognize the layout.
export const SEARCH_OPTIONS: SearchOptionDef[] = [
  { flags: '-q, --query <text>', description: 'Query to search' },
  { flags: '--port <n>', description: `CDP port`, defaultValue: DEFAULT_CONFIG.port },
  { flags: '--google-url <url>', description: 'Google URL to open', defaultValue: DEFAULT_CONFIG.googleUrl },
  { flags: '--chrome-bin <path>', description: 'Chrome binary path', defaultValue: DEFAULT_CONFIG.chromeBin },
  { flags: '--agent-browser-bin <path>', description: 'agent-browser binary path', defaultValue: DEFAULT_CONFIG.agentBrowserBin },
  { flags: '--profile-dir <path>', description: 'Chrome profile directory', defaultValue: DEFAULT_CONFIG.profileDir },
  { flags: '--start-log-dir <path>', description: 'Directory for launch logs', defaultValue: DEFAULT_CONFIG.startLogDir },
  { flags: '--type-delay-scale <n>', description: 'Typing speed multiplier (lower = faster)', defaultValue: DEFAULT_CONFIG.typeDelayScale },
  { flags: '--max-links <n>', description: 'Maximum extracted links', defaultValue: DEFAULT_CONFIG.maxLinks },
  { flags: '--format <json|ndjson>', description: 'Output format', defaultValue: DEFAULT_CONFIG.format },
  { flags: '--ai-mode', description: 'Use Google AI Mode (alias: --ai)' },
  { flags: '-c, --conversation', description: 'Enable multi-turn AI Mode (use with -f)' },
  { flags: '-f, --follow-up <text>', description: 'Follow-up question (repeatable)', collect: true, defaultValue: [] },
  { flags: '--retry', description: 'Retry on timeout/inconclusive/blocked (exp backoff)' },
  { flags: '--max-retries <n>', description: 'Max retries when --retry', defaultValue: DEFAULT_CONFIG.maxRetries },
  { flags: '--history-file <path>', description: 'Append-only JSONL of all searches', defaultValue: DEFAULT_CONFIG.historyFile },
  { flags: '--no-history', description: 'Disable history append' },
  { flags: '--use-cache', description: 'Reuse history entry for same query within TTL' },
  { flags: '--cache-ttl <seconds>', description: 'Cache TTL when --use-cache', defaultValue: DEFAULT_CONFIG.cacheTtlSeconds },
  { flags: '--merge-history', description: 'Emit merged dedup\'d links from last N searches (no browser)' },
  { flags: '--merge-limit <n>', description: 'Searches to merge with --merge-history', defaultValue: DEFAULT_CONFIG.mergeLimit },
  { flags: '--merge-ttl <seconds>', description: 'Window for --merge-history (seconds)', defaultValue: DEFAULT_CONFIG.mergeTtlSeconds },
  { flags: '--no-lock', description: 'Skip the per-port mutex (UNSAFE: keystrokes interleave)' },
  { flags: '--lock-wait <seconds>', description: 'Max seconds to wait for the lock', defaultValue: DEFAULT_CONFIG.lockWaitSeconds },
];

export function applySearchOptions(cmd: Command): Command {
  for (const opt of SEARCH_OPTIONS) {
    if (opt.collect) {
      const def = Array.isArray(opt.defaultValue) ? opt.defaultValue as string[] : [];
      cmd.option(opt.flags, opt.description, (v: string, prev: string[]) => [...prev, v], def);
    } else if (opt.defaultValue !== undefined) {
      cmd.option(opt.flags, opt.description, String(opt.defaultValue));
    } else {
      cmd.option(opt.flags, opt.description);
    }
  }
  return cmd;
}

// Commander returns string for value-bearing options because we pass string
// defaults. Coerce to the Config shape.
export function optsToConfig(positionalQuery: string | undefined, opts: Record<string, unknown>): Config {
  const query = (opts.query as string | undefined) ?? positionalQuery ?? '';
  const port = parseNumber(opts.port, DEFAULT_CONFIG.port, '--port');
  const typeDelayScale = parsePositiveFloat(opts.typeDelayScale, DEFAULT_CONFIG.typeDelayScale, '--type-delay-scale');
  const maxLinks = parsePositiveInt(opts.maxLinks, DEFAULT_CONFIG.maxLinks, '--max-links');
  const format = String(opts.format ?? DEFAULT_CONFIG.format);
  if (format !== 'json' && format !== 'ndjson') {
    throw new Error(`Invalid --format value: ${format}`);
  }
  return {
    port,
    googleUrl: String(opts.googleUrl ?? DEFAULT_CONFIG.googleUrl),
    searchQuery: query,
    chromeBin: String(opts.chromeBin ?? DEFAULT_CONFIG.chromeBin),
    agentBrowserBin: String(opts.agentBrowserBin ?? DEFAULT_CONFIG.agentBrowserBin),
    profileDir: String(opts.profileDir ?? DEFAULT_CONFIG.profileDir),
    startLogDir: String(opts.startLogDir ?? DEFAULT_CONFIG.startLogDir),
    typeDelayScale,
    maxLinks,
    format,
    aiMode: Boolean(opts.aiMode),
    conversation: Boolean(opts.conversation),
    followUps: Array.isArray(opts.followUp) ? (opts.followUp as string[]) : [],
    retry: Boolean(opts.retry),
    maxRetries: parseNumber(opts.maxRetries, DEFAULT_CONFIG.maxRetries, '--max-retries'),
    historyFile: String(opts.historyFile ?? DEFAULT_CONFIG.historyFile),
    // commander turns --no-history into history:false
    noHistory: opts.history === false,
    useCache: Boolean(opts.useCache),
    cacheTtlSeconds: parseNumber(opts.cacheTtl, DEFAULT_CONFIG.cacheTtlSeconds, '--cache-ttl'),
    mergeHistory: Boolean(opts.mergeHistory),
    mergeLimit: parseNumber(opts.mergeLimit, DEFAULT_CONFIG.mergeLimit, '--merge-limit'),
    mergeTtlSeconds: parseNumber(opts.mergeTtl, DEFAULT_CONFIG.mergeTtlSeconds, '--merge-ttl'),
    noLock: opts.lock === false,
    lockWaitSeconds: parseNumber(opts.lockWait, DEFAULT_CONFIG.lockWaitSeconds, '--lock-wait'),
  };
}

function parseNumber(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${label} value: ${value}`);
  return n;
}

function parsePositiveFloat(value: unknown, fallback: number, label: string): number {
  const n = parseNumber(value, fallback, label);
  if (n <= 0) throw new Error(`Invalid ${label} value: ${value} (must be > 0)`);
  return n;
}

function parsePositiveInt(value: unknown, fallback: number, label: string): number {
  return parsePositiveFloat(value, fallback, label);
}
