// src/emitter/index.ts
// JSON output emitter with format support.

import { Config } from '../config/index.js';
import { SearchLink } from '../parser/links.js';

export type SearchStatus = 'ok' | 'blocked' | 'inconclusive';

export interface SearchResultPayload {
  status: SearchStatus;
  query: string;
  title: string;
  links: Array<SearchLink & { position: number }>;
  cdpPort: number;
  source: 'google';
}

export function emitSearchResult(
  config: Config,
  payload: SearchResultPayload
): void {
  const text = config.format === 'ndjson'
    ? JSON.stringify(payload)
    : JSON.stringify(payload, null, 2);
  process.stdout.write(`${text}\n`);
}

export function createPayload(
  status: SearchStatus,
  query: string,
  title: string,
  links: SearchLink[],
  port: number
): SearchResultPayload {
  return {
    status,
    query,
    title,
    cdpPort: port,
    source: 'google',
    links: links.map((link, index) => ({
      position: index + 1,
      ...link,
    })),
  };
}