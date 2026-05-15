# gscli — Google Search CLI

A TypeScript CLI that drives a logged-in Chrome over CDP and extracts SERP links with human-like typing. Built for LLM agent workflows: deterministic JSON output, persistent search history, Google AI Mode, multi-turn conversations, retry/cache/merge, and a hard mutex against parallel-keystroke corruption.

```
gscli "agent-browser cdp mode"
gscli "what is python" --ai
gscli --merge-history --merge-limit 5
```

## Install

```bash
git clone https://github.com/roger8b/google-search-cli ~/wiki/google-search-cli
cd ~/wiki/google-search-cli
./install.sh --local
```

The installer:

1. Verifies Node ≥18.
2. Checks for `agent-browser` on `PATH` (required for actual searches).
3. Syncs the repo to `~/.gscli/`, runs `npm install` + `npm run build`, then `npm link` (exposes the `gscli` bin globally).
4. Optionally runs `gscli setup` to log you in to Google.

Re-run with `--no-setup` to skip the Chrome login step. Re-run any time to upgrade — it never touches `~/.gscli/chrome-profile/`, `~/.gscli/history/` or any user data.

## First-time setup

```bash
gscli setup
```

Opens a **separate Chrome debug window** using a dedicated profile at `~/.gscli/chrome-profile`. Your personal Chrome stays open and untouched. Complete the Google sign-in, come back, and press ENTER.

| Flag | What |
|------|------|
| `--port <n>` | CDP port (default `9222`) |
| `--profile-dir <path>` | Override the profile location |
| `--chrome-bin <path>` | Override Chrome binary |
| `--force` | Kill the existing Chrome on the port/profile and relaunch |
| `--reuse` | If CDP already answers on the port, skip launch and go straight to login |

## Daily use

```bash
gscli "<query>"                      # regular Google SERP
gscli "<query>" --ai                 # Google AI Mode summary
gscli "<query>" --ai -c -f "follow-up"
gscli "<query>" --max-links 5 --format ndjson
gscli "<query>" --use-cache          # skip browser if same query within TTL
gscli --merge-history --merge-limit 5
gscli doctor                         # health check
gscli --help                         # full flag reference
```

Exit codes: `0` ok · `1` error · `2` blocked (CAPTCHA) · `3` inconclusive (zero links).

## Wire into an LLM agent (Claude Code / Codex / Gemini CLI)

`gscli init` detects a project's agent rule file and installs gscli-* skills:

```bash
cd ~/my-project
gscli init                # auto-detects CLAUDE.md / AGENTS.md / GEMINI.md
gscli init --agent codex  # force a specific agent
gscli uninstall           # reverse it
```

Effect per agent:

| Agent | Rule file | Skills dir |
|-------|-----------|------------|
| `claude-code` | `CLAUDE.md` | `.claude/skills/gscli-*` |
| `codex` | `AGENTS.md` | `.agents/skills/gscli-*` |
| `gemini` | `GEMINI.md` | `.gemini/skills/gscli-*` |

A marker-delimited section (`<!-- gscli-start --> … <!-- gscli-end -->`) is injected so re-running `gscli init` is idempotent.

## Output

```json
{
  "status": "ok",
  "query": "agent-browser cdp mode",
  "title": "agent-browser cdp mode - Google Search",
  "links": [
    { "position": 1, "title": "…", "url": "…", "snippet": "…" }
  ],
  "cdpPort": 9222,
  "source": "google"
}
```

`--merge-history` adds a `sources: [query1, query2, …]` field on each link.

## Paths

| What | Where |
|------|-------|
| Install dir | `~/.gscli` (code only, safe to wipe) |
| Chrome profile | `~/.gscli/chrome-profile` |
| Search history | `~/.gscli/history/searches.jsonl` |
| Chrome launch logs | `$TMPDIR/gscli/chrome-<port>.log` |
| Per-port lock | `$TMPDIR/google-search-script-<port>.lock` |

Override with env: `GSCLI_HOME`, `CHROME_DEBUG_DIR`, `SEARCH_HISTORY_FILE`, `START_LOG_DIR`, `CDP_PORT`, `CHROME_BIN`, `AGENT_BROWSER_BIN`.

## Concurrency

Every run takes an exclusive lock per CDP port. Without it, parallel runs on the same Chrome interleave keystrokes. Locks auto-release on exit / SIGINT / SIGTERM and are reaped after 10 min or when the holder PID dies.

`--no-lock` is **UNSAFE** unless you serialize externally.

## AI Mode multi-turn caveat

Google's AI Mode (`udm=50`, pt-BR) does **not** render an inline follow-up box. Each follow-up is issued as a fresh `?q=…&udm=50` URL with no carried context. Always restate context in the follow-up:

```bash
gscli "what is python" --ai -c \
  -f "in the context of python, give a concrete example"
```

## Dev

```bash
npm install
npm run dev -- "test query"   # tsx, no build
npm run build                 # tsc → dist/
npm test                      # vitest
```

## License

MIT.
