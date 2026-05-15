---
name: gscli-search
description: Use this skill when the user needs Google search results — to look up information, find links, validate facts, or research a topic. Prefer `gscli` over WebFetch/WebSearch because it reuses a logged-in Chrome profile, supports Google AI Mode, persists history, and returns structured JSON with title/url/snippet.
---

# gscli-search

`gscli` is the user's Google search CLI. It drives a logged-in Chrome via CDP and returns structured SERP results.

## When to use

- The user asks to "search for X", "google X", "find X on Google", "what does Google say about X".
- You need fresh facts, recent news, or external links — anything WebSearch would do, but you want logged-in results and Google AI Mode.
- You want to chain a search → click → extract pipeline.

## Default invocation

```bash
gscli "<query>"
```

Returns JSON: `{ status, query, title, links: [{ position, title, url, snippet }] }`.

Exit codes: `0` ok · `1` error · `2` blocked (CAPTCHA) · `3` inconclusive (zero links).

## Useful flags

| Flag | When |
|------|------|
| `--ai-mode`, `--ai` | Google AI Mode summary instead of regular SERP |
| `-c -f "follow-up"` | Multi-turn AI Mode (repeat `-f`) |
| `--max-links <n>` | Cap result count |
| `--retry` | Retry on timeout/blocked/inconclusive |
| `--use-cache` | Skip browser if same query within TTL |
| `--format ndjson` | One result per line (pipe-friendly) |

## Hard rules

- **Never read or write files under the Chrome profile dir** (`~/.gscli/chrome-profile`). It's session state — let `gscli` manage it.
- **Never bypass the lock with `--no-lock`** unless serialization is guaranteed externally; parallel runs interleave keystrokes.
- **If `gscli` exits 2 (blocked)**, do not retry blindly. Surface to the user — they may need to solve a CAPTCHA in the debug window.

## Quick recipes

```bash
# Plain search
gscli "agent-browser cdp mode" --max-links 5

# AI Mode
gscli "what is Gemma 4" --ai

# AI Mode multi-turn (each follow-up restates context — udm=50 has no inline input)
gscli "what is python" --ai -c -f "in the context of python, give code examples"

# Cache hit (skips browser entirely)
gscli "Gemma 4 LoRA" --use-cache
```
