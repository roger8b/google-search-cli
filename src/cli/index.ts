// src/cli/index.ts
// CLI parsing for Google Search Script.

import { Config, DEFAULT_CONFIG } from '../config/index.js';

export interface CliOptions {
  query: string;
  port: number;
  googleUrl: string;
  chromeBin: string;
  agentBrowserBin: string;
  profileDir: string;
  startLogDir: string;
  typeDelayScale: number;
  maxLinks: number;
  format: 'json' | 'ndjson';
  aiMode: boolean;
}

export function parseCli(argv: string[]): Config {
  const opts: Config = { ...DEFAULT_CONFIG, followUps: [...DEFAULT_CONFIG.followUps] };
  let positionalQueryUsed = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'search') continue;

    const takeNext = (): string => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--version' || arg === '-v') {
      process.stdout.write('gscli 0.1.0\n');
      process.exit(0);
    }
    if (arg === '--query' || arg === '-q') {
      opts.searchQuery = takeNext();
      continue;
    }
    if (arg === '--port') {
      opts.port = Number(takeNext());
      continue;
    }
    if (arg === '--google-url') {
      opts.googleUrl = takeNext();
      continue;
    }
    if (arg === '--chrome-bin') {
      opts.chromeBin = takeNext();
      continue;
    }
    if (arg === '--agent-browser-bin') {
      opts.agentBrowserBin = takeNext();
      continue;
    }
    if (arg === '--profile-dir') {
      opts.profileDir = takeNext();
      continue;
    }
    if (arg === '--start-log-dir') {
      opts.startLogDir = takeNext();
      continue;
    }
    if (arg === '--type-delay-scale') {
      opts.typeDelayScale = Number(takeNext());
      continue;
    }
    if (arg === '--max-links') {
      opts.maxLinks = Number(takeNext());
      continue;
    }
    if (arg === '--format') {
      const value = takeNext();
      if (value !== 'json' && value !== 'ndjson') {
        throw new Error(`Invalid --format value: ${value}`);
      }
      opts.format = value;
      continue;
    }
    if (arg === '--ai-mode' || arg === '--ai') {
      opts.aiMode = true;
      continue;
    }
    if (arg === '--conversation' || arg === '-c') {
      opts.conversation = true;
      continue;
    }
    if (arg === '--follow-up' || arg === '-f') {
      opts.followUps.push(takeNext());
      continue;
    }
    if (arg === '--retry') {
      opts.retry = true;
      continue;
    }
    if (arg === '--max-retries') {
      opts.maxRetries = Number(takeNext());
      continue;
    }
    if (arg === '--history-file') {
      opts.historyFile = takeNext();
      continue;
    }
    if (arg === '--no-history') {
      opts.noHistory = true;
      continue;
    }
    if (arg === '--use-cache') {
      opts.useCache = true;
      continue;
    }
    if (arg === '--cache-ttl') {
      opts.cacheTtlSeconds = Number(takeNext());
      continue;
    }
    if (arg === '--merge-history') {
      opts.mergeHistory = true;
      continue;
    }
    if (arg === '--merge-limit') {
      opts.mergeLimit = Number(takeNext());
      continue;
    }
    if (arg === '--merge-ttl') {
      opts.mergeTtlSeconds = Number(takeNext());
      continue;
    }
    if (arg === '--no-lock') {
      opts.noLock = true;
      continue;
    }
    if (arg === '--lock-wait') {
      opts.lockWaitSeconds = Number(takeNext());
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!positionalQueryUsed) {
      opts.searchQuery = arg;
      positionalQueryUsed = true;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!Number.isFinite(opts.port) || opts.port <= 0) {
    throw new Error(`Invalid --port value: ${opts.port}`);
  }
  if (!Number.isFinite(opts.typeDelayScale) || opts.typeDelayScale <= 0) {
    throw new Error(`Invalid --type-delay-scale value: ${opts.typeDelayScale}`);
  }
  if (!Number.isFinite(opts.maxLinks) || opts.maxLinks <= 0) {
    throw new Error(`Invalid --max-links value: ${opts.maxLinks}`);
  }

  return opts as Config;
}

export function printHelp(): void {
  process.stdout.write(`
gscli

Usage:
  gscli search [query] [options]
  gscli [query] [options]

Options:
  -q, --query <text>          Query to search
  --port <n>                 CDP port (default: ${DEFAULT_CONFIG.port})
  --google-url <url>         Google URL to open (default: ${DEFAULT_CONFIG.googleUrl})
  --chrome-bin <path>        Chrome binary path
  --agent-browser-bin <path> agent-browser binary path
  --profile-dir <path>       Chrome profile directory
  --start-log-dir <path>     Directory for launch logs
  --type-delay-scale <n>     Typing speed multiplier (default: ${DEFAULT_CONFIG.typeDelayScale})
  --max-links <n>            Maximum extracted links (default: 10)
  --format <json|ndjson>     Output format (default: json)
  --ai-mode, --ai            Use Google AI Mode instead of regular search
  --conversation, -c         Enable multi-turn AI Mode (use with -f)
  -f, --follow-up <text>     Follow-up question (repeatable)
  --retry                    Retry on timeout/inconclusive/blocked (exp backoff)
  --max-retries <n>          Max retries when --retry (default: 2)
  --history-file <path>      Append-only JSONL of all searches (default: <script>/history/searches.jsonl)
  --no-history               Disable history append
  --use-cache                Reuse history entry for same query if within TTL (skips browser)
  --cache-ttl <seconds>      Cache TTL when --use-cache (default: 3600)
  --merge-history            Skip browser; emit merged dedup'd links from last N searches
  --merge-limit <n>          Max searches to merge with --merge-history (default: 10)
  --merge-ttl <seconds>      Window for --merge-history (default: 86400 / 24h)
  --no-lock                  Skip the per-port mutex (UNSAFE: parallel runs interleave keystrokes)
  --lock-wait <seconds>      Max seconds to wait for the lock (default: 120)
  -h, --help                 Show help
  -v, --version              Show version

Examples:
  gscli "agent-browser cdp mode"
  gscli search --query "agent-browser cdp mode" --max-links 5
  gscli search "agent-browser cdp mode" --format ndjson
`);
}