#!/usr/bin/env node
// src/index.ts
// gscli entrypoint. Pure Commander — `setup`, `init`, `uninstall`, `doctor`,
// `search` (default). All search flags live in src/cli/options.ts and are
// wired into the `search` subcommand.

import { Command } from 'commander';
import pc from 'picocolors';
import { runSetup } from './commands/setup.js';
import { runSearch } from './commands/search.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runUninstall } from './commands/uninstall.js';
import { applySearchOptions, optsToConfig, SEARCH_OPTIONS } from './cli/options.js';
import { VERSION } from './utils/version.js';

const KNOWN_COMMANDS = new Set(['setup', 'init', 'uninstall', 'doctor', 'search', 'help']);

function printRootHelp(): void {
  process.stdout.write(`
gscli ${VERSION} — Google Search CLI

Usage:
  gscli setup [options]              Launch Chrome debug window + sign into Google
  gscli init [options]               Wire gscli into the current project
  gscli uninstall [options]          Reverse of init
  gscli doctor                       Verify Chrome, agent-browser, CDP, paths
  gscli [search] <query> [options]   Run a search (default command)
  gscli --version / --help

Commands:
  setup       One-time Chrome login (separate profile — personal Chrome stays)
  init        Detects CLAUDE.md / AGENTS.md / GEMINI.md and installs skills
  uninstall   Removes the rules section and gscli-* skills
  doctor      Health check
  search      Run a Google search (regular or AI Mode), with history, cache,
              merge-history and retry support

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
  const pad = Math.max(...SEARCH_OPTIONS.map((o) => o.flags.length)) + 2;
  for (const o of SEARCH_OPTIONS) {
    const def = o.defaultValue !== undefined && !o.collect && !(o.flags.startsWith('--no-')) && o.flags.includes('<')
      ? pc.dim(`  (default: ${String(o.defaultValue)})`)
      : '';
    process.stdout.write(`  ${o.flags.padEnd(pad)}${o.description}${def}\n`);
  }
  process.stdout.write(`\nExamples:\n`);
  process.stdout.write(`  gscli "agent-browser cdp mode"\n`);
  process.stdout.write(`  gscli "what is python" --ai -c -f "give code examples"\n`);
  process.stdout.write(`  gscli --merge-history --merge-limit 5\n`);
  process.stdout.write(`\n`);
}

// Rewrite the legacy `--ai` alias to `--ai-mode` so commander only needs to
// know one canonical flag name.
function normalizeAlias(argv: string[]): string[] {
  return argv.map((a) => (a === '--ai' ? '--ai-mode' : a));
}

async function dispatch(rawArgv: string[]): Promise<number> {
  const argv = normalizeAlias(rawArgv);
  const first = argv[2];

  if (first === '--help' || first === '-h' || first === 'help') {
    printRootHelp();
    return 0;
  }
  if (first === '--version' || first === '-v') {
    process.stdout.write(`gscli ${VERSION}\n`);
    return 0;
  }

  // Implicit search: prepend 'search' so commander routes to that subcommand.
  if (first && !KNOWN_COMMANDS.has(first)) {
    argv.splice(2, 0, 'search');
  }

  const program = new Command();
  program
    .name('gscli')
    .description('Google Search CLI — SERP extraction via CDP, AI Mode, history, cache.')
    .version(VERSION)
    .exitOverride((err) => {
      // commander throws CommanderError for help/version — let it bubble.
      throw err;
    });

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

  const searchCmd = program
    .command('search [query]')
    .description('Run a Google search (default — same as `gscli <query>`)');
  applySearchOptions(searchCmd);
  searchCmd.action(async (positionalQuery: string | undefined, opts: Record<string, unknown>) => {
    const config = optsToConfig(positionalQuery, opts);
    process.exitCode = await runSearch(config);
  });

  try {
    await program.parseAsync(argv);
  } catch (err: unknown) {
    // commander uses err.code === 'commander.helpDisplayed' / 'commander.version'
    const code = (err as { code?: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.version') return 0;
    throw err;
  }
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

dispatch(process.argv)
  .then((code) => { process.exitCode = code; })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[gscli] ERROR: ${message}\n`);
    process.exit(1);
  });
