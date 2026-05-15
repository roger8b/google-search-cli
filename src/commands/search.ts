// src/commands/search.ts
// Search orchestration: applies merge-history/cache shortcuts, acquires the
// per-port lock, and runs performSearch with optional retry. Receives a fully
// resolved Config — option parsing happens in src/cli/options.ts via Commander.

import { performSearch } from '../search/index.js';
import { Config } from '../config/index.js';
import { lookupHistory, mergeRecentHistory } from '../history/index.js';
import { createPayload, emitSearchResult } from '../emitter/index.js';
import { acquireLock } from '../lock.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RETRIABLE_CODES = new Set<number>([1, 2, 3]);

async function performSearchWithRetry(config: Config): Promise<number> {
  if (!config.retry) {
    return performSearch(config);
  }
  const max = Math.max(0, config.maxRetries);
  let lastCode = 1;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= max; attempt += 1) {
    try {
      const code = await performSearch(config);
      if (code === 0) return 0;
      lastCode = code;
      if (!RETRIABLE_CODES.has(code)) return code;
      process.stderr.write(`[gscli] attempt ${attempt + 1}/${max + 1} returned code ${code}\n`);
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[gscli] attempt ${attempt + 1}/${max + 1} threw: ${message}\n`);
    }
    if (attempt < max) {
      const delay = Math.min(30000, 1500 * Math.pow(2, attempt));
      process.stderr.write(`[gscli] backoff ${delay}ms before retry\n`);
      await sleep(delay);
    }
  }
  if (lastError instanceof Error) throw lastError;
  return lastCode;
}

export async function runSearch(config: Config): Promise<number> {
  if (config.mergeHistory) {
    const { entries, merged } = mergeRecentHistory(config, {
      limit: config.mergeLimit,
      ttlSeconds: config.mergeTtlSeconds,
    });
    process.stderr.write(`[gscli] merged ${entries.length} searches -> ${merged.length} unique links\n`);
    const payload = {
      status: 'ok' as const,
      mode: 'merge-history',
      mergedFrom: entries.map((e) => ({ ts: e.ts, query: e.query })),
      links: merged.map((l, i) => ({ position: i + 1, ...l })),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return 0;
  }

  if (config.useCache) {
    const hit = lookupHistory(config, config.searchQuery, config.cacheTtlSeconds);
    if (hit) {
      process.stderr.write(`[gscli] cache hit for "${config.searchQuery}" (${hit.ts})\n`);
      const linksOnly = hit.links.map((l) => ({ title: l.title, url: l.url, snippet: l.snippet }));
      const payload = createPayload('ok', hit.query, hit.title, linksOnly, hit.cdpPort);
      emitSearchResult(config, payload);
      return 0;
    }
  }

  let releaseLock: (() => void) | null = null;
  if (!config.noLock) {
    try {
      releaseLock = await acquireLock({
        port: config.port,
        waitMs: config.lockWaitSeconds * 1000,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[gscli] ERROR: ${message}\n`);
      return 1;
    }
  }

  try {
    return await performSearchWithRetry(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[gscli] ERROR: ${message}\n`);
    return 1;
  } finally {
    if (releaseLock) releaseLock();
  }
}
