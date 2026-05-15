# Claude Code — gscli

Working on the `gscli` source tree. The canonical rules are in [`AGENTS.md`](AGENTS.md); this file adds Claude-Code-specific guidance.

## Read first

- [`AGENTS.md`](AGENTS.md) — structure, conventions, paths, hard rules.
- [`README.md`](README.md) — user-facing CLI surface (commands, flags, exit codes).

## Claude-specific

### When uncertain, run `gscli doctor`

Before changing browser launch or CDP code, run `gscli doctor` on the installed copy. It confirms `agent-browser`, Chrome bin, CDP, profile, history paths. Saves a round-trip.

### Use the dev script, not the built bin, while iterating

```bash
npm run dev -- <args>            # tsx, no build step
```

Only rebuild (`npm run build`) before committing or before re-running `gscli ...` against the installed bin.

### Tests are cheap — run them before every commit

```bash
npm test
```

5 test files, 31+ tests, finishes in <1s. If you touched `src/cli/options.ts` or any command, also add a test case.

### When asked to add a new search flag

Touch these four files in this order, or the change will leak:

1. `src/config/index.ts` — add field to `Config` + default
2. `src/cli/options.ts` — add to `SEARCH_OPTIONS` + map in `optsToConfig`
3. `tests/options.test.ts` — add a case
4. `README.md` — document under "Daily use" if user-facing

### When asked to add an agent (init target)

Edit `src/utils/agents.ts`, add a `{ id, label, ruleFile, skillsDir }` entry. `runInit` and `runUninstall` pick it up automatically. Add a test case in `tests/init.test.ts` for `--agent <id>` override.

### Skill templates

`templates/skills/gscli-*/SKILL.md` are copied verbatim into projects by `gscli init`. Treat them as user-facing docs. The frontmatter `description` controls when an LLM picks the skill — keep it specific and include both trigger and anti-trigger phrasing.

### Do NOT

- Reintroduce the old `parseCli` parser — it was replaced by Commander in commit `18757c2`. All flag definitions live in `src/cli/options.ts`.
- Add `console.log` for diagnostics — use `process.stderr.write` with the `[gscli]` prefix, or `pc.<color>` via `console.error`.
- Touch `src/agent-mode/`, `src/search/`, `src/parser/`, `src/human/` without first running `gscli doctor` and verifying a real `gscli "smoke"` call still returns JSON. They drive a live browser.

### Memory paths

User data lives under `~/.gscli/`. Treat anything in there as user state — never delete, never rewrite. The installer (`install.sh --local`) explicitly excludes `chrome-profile/` from rsync for this reason.
