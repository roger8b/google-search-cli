# Agent guide — gscli

This file is the canonical instruction set for any AI coding agent (Codex, Claude Code, Gemini CLI, Cursor, etc.) working on the `gscli` source tree. `CLAUDE.md` re-exports this file with Claude-Code-specific overrides.

## What this project is

`gscli` is a TypeScript ESM CLI distributed as a global `gscli` bin. It drives a logged-in Chrome over CDP to extract Google SERP links, plus an AI Mode path, persistent history (`~/.gscli/history/searches.jsonl`), a cache, a cross-search merge, and a per-port mutex.

```
src/
├── cli/             # Commander option definitions (options.ts)
├── commands/        # one file per subcommand (setup, search, doctor, init, uninstall)
├── browser/         # Chrome launch + CDP connect
├── search/          # SERP extraction via agent-browser
├── history/         # JSONL append + lookup + merge
├── emitter/         # output payload shaping (json / ndjson)
├── parser/          # SERP HTML → links
├── human/           # human-typing simulation
├── agent-mode/      # AI Mode flow
├── config/          # env + defaults
├── utils/           # version, agents registry, templates-dir
├── lock.ts          # per-port mutex
└── index.ts         # Commander root + dispatcher
templates/skills/    # gscli-* skills copied by `gscli init`
tests/               # vitest
```

## Conventions

### Language / module system

- TypeScript `strict: true`, `target: ES2022`, `module: NodeNext`.
- All relative imports end in `.js` (ESM): `import { x } from "./foo.js"`.
- Node built-ins use the `node:` prefix: `import path from "node:path"`.
- Named exports only. No default exports in `src/`.

### Imports order

1. Node built-ins
2. Third-party (`commander`, `picocolors`)
3. `../cli/…`, `../config/…`, `../utils/…`
4. Local relative

### Command handlers

- Live in `src/commands/<name>.ts` and export a single `run<Name>(opts) => Promise<number>`.
- Return the exit code; never call `process.exit` directly.
- Set `process.exitCode` only in `src/index.ts` after `await` of the handler.
- Use `picocolors` (`pc.red`, `pc.green`, `pc.yellow`, `pc.dim`, `pc.cyan`) for stderr; never colorize stdout (it is machine output).
- Log user-facing diagnostics to **stderr**. Reserve **stdout** for the JSON / NDJSON payload.

### CLI flags

- Every search flag is defined exactly once, in `src/cli/options.ts` (`SEARCH_OPTIONS`).
- Adding a flag: update `SEARCH_OPTIONS` + `optsToConfig` + `Config` interface + a test in `tests/options.test.ts`.
- The `--ai` alias is rewritten to `--ai-mode` in `dispatch()`. Do not add Commander's alias machinery elsewhere.

### Paths

- User data lives under `GSCLI_HOME` (default `~/.gscli`): code (`npm link` target), `chrome-profile/`, `history/searches.jsonl`. Never assume the install dir is writable for user data.
- Lock files live in `os.tmpdir()`. Logs too.
- Always resolve user-provided paths absolutely; never hard-code home or `/tmp`.

### Error handling

- Throw `Error` with a clear message in pure utilities; commands catch and translate to exit codes (1 = error, 2 = blocked, 3 = inconclusive).
- Never swallow errors silently — log to stderr with `[gscli]` prefix.

## Tests

- **Vitest** in `tests/`, file pattern `<topic>.test.ts`. ESM-native — import from `src/` with `.js` suffix.
- Use `mkdtempSync(path.join(os.tmpdir(), 'gscli-…-'))` for any test that touches the filesystem; clean up with `fs.rmSync(dir, { recursive: true, force: true })` in `afterEach`.
- A new flag in `src/cli/options.ts` requires a corresponding case in `tests/options.test.ts`.
- New utilities in `src/utils/` should have a unit test.
- Run: `npm test`. CI matrix: Node 20 and 22.

## Build / release

- `npm run build` → `dist/` (tsc).
- `npm install` triggers `prepare` which runs `build` — required because the `bin` points to `dist/index.js`.
- `npm test` runs vitest once (CI mode).
- `npm run dev -- <args>` runs `tsx src/index.ts` for fast iteration.

## Commits / PRs

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`. Scope optional.
- Always co-author trailer when AI-assisted: `Co-Authored-By: Claude … <noreply@anthropic.com>`.
- Branches: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.
- Never commit `dist/`, `node_modules/`, `coverage/`, or anything under `~/.gscli/`.

## Hard rules

- Never read or write files under `~/.gscli/chrome-profile/` — it is live browser session state.
- Never edit `~/.gscli/history/searches.jsonl` by hand; it is append-only and `--use-cache` / `--merge-history` depend on its ordering.
- Never bypass the per-port lock (`--no-lock`) in code paths. It exists because parallel runs on the same Chrome interleave keystrokes char-by-char.
- Never call `process.exit` from inside a command handler — return the code.
- Never colorize stdout. Stdout is the machine payload.

## Useful commands while developing

```bash
npm run dev -- --help                     # tsx-driven help, no rebuild
npm run dev -- "smoke query" --no-lock --no-history
npm test
gscli doctor                              # against the installed copy
```
