---
name: gscli-history
description: Use this skill when the user wants to review past searches, merge results across multiple recent queries, or reuse a cached result for an identical query to skip the browser. Trigger phrases include "what did we search", "merge results", "all links about X", "history of my searches", "same query again use cache", "without re-running the browser".
---

# gscli-history

`gscli` appends every successful search to `~/.gscli/history/searches.jsonl` (one entry per line). The history is the source of truth for both **cache hits** (single-query reuse) and **merge** (cross-search union of links).

## When to use

- User asks what they searched recently or wants to see prior queries.
- User wants the union of links from several recent searches, deduped.
- User asks for citations / link lists from prior research without re-running Chrome.
- User repeats an identical query and wants the cached result.

## Merge multiple recent searches

```bash
gscli --merge-history --merge-limit 5 --merge-ttl 7200
```

Returns deduped union of links from the last N searches within the TTL window. Each merged link carries `sources: [query1, query2, ...]` showing which searches produced it.

## Cache: reuse a single previous query

```bash
gscli "exact same query" --use-cache --cache-ttl 3600
```

If a matching entry exists within `--cache-ttl` seconds, returns it without opening Chrome.

## Read history directly

The history is plain JSONL — safe to grep / pipe through `jq`:

```bash
# Last 20 queries
tail -n 20 ~/.gscli/history/searches.jsonl | jq -r .query

# All URLs ever returned for queries containing "python"
grep -i "python" ~/.gscli/history/searches.jsonl | jq -r '.links[].url'

# Searches from the last hour
jq -c "select(.ts > \"$(date -u -v -1H +%Y-%m-%dT%H:%M:%SZ)\")" ~/.gscli/history/searches.jsonl

# All ai-mode searches
jq -c 'select(.mode == "ai-mode")' ~/.gscli/history/searches.jsonl
```

## Hard rules

- **Never edit `searches.jsonl` by hand.** It's append-only; reordering or rewriting entries breaks cache and merge.
- **Disable history with `--no-history` only for one-off / sensitive queries.** Otherwise leave it on — it makes follow-ups cheap.
