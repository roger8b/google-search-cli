#!/usr/bin/env node
// src/index.ts
// gscli entrypoint. Commander handles `setup`, `init`, `uninstall`, `doctor`.
// A query (or any unknown first arg) falls through to the legacy parseCli
// so every historic search flag keeps working.

import { Command } from 'commander';
import { runSetup } from './commands/setup.js';
import { runSearch } from './commands/search.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runUninstall } from './commands/uninstall.js';
import { printHelp as printSearchHelp } from './cli/index.js';
import { VERSION } from './utils/version.js';

const COMMANDER_TOKENS = new Set([
  'setup', 'init', 'uninstall', 'doctor',
  'help', '--help', '-h', '--version', '-v',
]);

function printRootHelp(): void {
  process.stdout.write(`
gscli ${VERSION} — Google Search CLI

Usage:
  gscli setup [options]              Launch Chrome debug window + sign into Google
  gscli init [options]               Wire gscli into the current project's agent rules
  gscli uninstall [options]          Reverse of init
  gscli doctor                       Verify Chrome, agent-browser, CDP, paths
  gscli [search] [query] [options]   Run a search (default command)
  gscli --version / --help

Commands:
  setup       One-time Chrome login. Uses a separate profile — personal Chrome
              stays open and untouched. Supports --force / --reuse.
  init        Detects agent rule files (CLAUDE.md, AGENTS.md, GEMINI.md) and
              installs gscli-* skills + injects a rules section.
  uninstall   Removes the rules section and gscli-* skills.
  doctor      Health check.
  search      Run a Google search (regular or AI Mode), with history, cache,
              merge-history and retry support.

Setup options:
  --port <n>            CDP port (default: 9222)
  --profile-dir <path>  Chrome profile dir (default: ~/.gscli/chrome-profile)
  --chrome-bin <path>   Chrome binary path
  --force               Kill any Chrome on the port/profile, then relaunch
  --reuse               Reuse existing CDP if already up; skip launch

Init / uninstall options:
  --agent <id>          Force a specific agent (claude-code | codex | gemini)
  --force               Overwrite existing skills on init

Search options (use after a query, or with 'search' subcommand):
`);
  printSearchHelp();
}

async function dispatch(argv: string[]): Promise<number> {
  const first = argv[2];

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
    .action(async (opts) => { process.exitCode = await runSetup(opts); });

  program
    .command('init')
    .description('Wire gscli into the current project (skills + rule section)')
    .option('--agent <id>', 'Force a specific agent: claude-code | codex | gemini')
    .option('--force', 'Overwrite existing skill directories')
    .action(async (opts) => { process.exitCode = await runInit(opts); });

  program
    .command('uninstall')
    .description('Remove gscli rule section + skills from the current project')
    .option('--agent <id>', 'Force a specific agent')
    .action(async (opts) => { process.exitCode = await runUninstall(opts); });

  program
    .command('doctor')
    .description('Health check: Chrome, agent-browser, CDP, paths')
    .action(async () => { process.exitCode = await runDoctor(); });

  program
    .command('search [query...]')
    .description('Run a Google search (default — same as `gscli <query>`)')
    .allowUnknownOption(true)
    .helpOption(false)
    .action(() => {
      // Unreachable: routed manually above.
    });

  await program.parseAsync(argv);
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

dispatch(process.argv)
  .then((code) => { process.exitCode = code; })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[gscli] ERROR: ${message}\n`);
    process.exit(1);
  });
