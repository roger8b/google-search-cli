#!/usr/bin/env node
// src/index.ts
// gscli entrypoint — Commander dispatches `setup` (and future `init`).
// Anything else is forwarded to the legacy search parser (parseCli) so all
// existing flags keep working unchanged.

import { Command } from 'commander';
import { runSetup } from './commands/setup.js';
import { runSearch } from './commands/search.js';
import { printHelp as printSearchHelp } from './cli/index.js';

const VERSION = '0.1.0';

// Subcommands handled by Commander. Everything else falls through to search.
const COMMANDER_TOKENS = new Set(['setup', 'help', '--help', '-h', '--version', '-v']);

function printRootHelp(): void {
  process.stdout.write(`
gscli — Google Search CLI

Usage:
  gscli setup [options]            Launch Chrome debug window + sign into Google
  gscli [search] [query] [options] Run a search (default command)
  gscli --version                  Show version
  gscli --help                     Show this help

Commands:
  setup    One-time Chrome login (uses a separate profile — your personal
           Chrome stays open and untouched)
  search   Run a Google search. Supports regular search and Google AI Mode,
           plus history, cache, merge-history and retry. See flags below.

Setup options:
  --port <n>            CDP port (default: 9222)
  --profile-dir <path>  Chrome profile dir (default: ~/.gscli/chrome-profile)
  --chrome-bin <path>   Chrome binary path
  --force               Kill any Chrome on the port/profile, then relaunch
  --reuse               Reuse existing CDP if already up; skip launch

Search options (use after a query, or with 'search' subcommand):
`);
  printSearchHelp();
}

async function dispatch(argv: string[]): Promise<number> {
  const first = argv[2];

  // Root-level help / version: intercept before parseCli, which only prints
  // search-mode help. We want the user to see setup + AI Mode + all search flags.
  if (first === '--help' || first === '-h' || first === 'help') {
    printRootHelp();
    return 0;
  }
  if (first === '--version' || first === '-v') {
    process.stdout.write(`gscli ${VERSION}\n`);
    return 0;
  }

  // Implicit search: no first arg, or first arg is a query / option for search.
  if (!first || (!COMMANDER_TOKENS.has(first) && first !== 'search')) {
    return runSearch(argv.slice(2));
  }
  if (first === 'search') {
    return runSearch(argv.slice(3));
  }

  // Commander handles the rest (setup, help, version).
  const program = new Command();
  program
    .name('gscli')
    .description('Google Search CLI — SERP extraction via CDP, AI Mode, history, cache.')
    .version(VERSION);

  program
    .command('setup')
    .description('Launch Chrome with debugging + sign into Google (one-time)')
    .option('--port <n>', 'CDP port', String(9222))
    .option('--profile-dir <path>', 'Chrome profile directory')
    .option('--chrome-bin <path>', 'Chrome binary path')
    .option('--force', 'Kill any Chrome already running on the port/profile, then relaunch')
    .option('--reuse', 'If CDP already answers on the port, skip launch and go to login step')
    .action(async (opts) => {
      const code = await runSetup(opts);
      process.exitCode = code;
    });

  // Hint that `search` exists, even though we routed it manually above.
  program
    .command('search [query...]')
    .description('Run a Google search (default — same as `gscli <query>`)')
    .allowUnknownOption(true)
    .helpOption(false)
    .action(() => {
      // Unreachable: the manual route above catches `search`.
    });

  await program.parseAsync(argv);
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

dispatch(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[gscli] ERROR: ${message}\n`);
    process.exit(1);
  });
