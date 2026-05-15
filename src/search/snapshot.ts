// src/search/snapshot.ts
// Page snapshot and search box detection.

import { runMaybe } from '../browser/agent.js';
import fs from 'node:fs';
import path from 'path';

function findSearchBoxInSnapshot(snapshot: string): string | null {
  const lines = snapshot.split(/\r?\n/);
  for (const line of lines) {
    const isSearchBox = line.includes('combobox "Pesquisar"') || line.includes('combobox "Search"');
    if (!isSearchBox) continue;
    const match = line.match(/ref=(e\d+)/);
    if (match) return match[1];
  }
  return null;
}

export function getSearchBoxRef(bin: string, port: number): string {
  // 3 tentativas com fresh snapshot - mitiga ref staleness em sessoes longas
  const errors: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const snapshot = runMaybe(bin, ['--cdp', String(port), 'snapshot', '-i'], port);
      const ref = findSearchBoxInSnapshot(snapshot);
      if (ref) return ref;
      errors.push(`attempt ${attempt}: combobox not found in snapshot`);
    } catch (e) {
      errors.push(`attempt ${attempt}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (attempt < 3) {
      // pequena pausa pra DOM estabilizar
      const start = Date.now();
      while (Date.now() - start < 500) { /* busy wait curto */ }
    }
  }
  throw new Error(`Could not detect Google search box ref. ${errors.join('; ')}`);
}

export function clearSearchBox(bin: string, port: number, ref: string): void {
  // Usa `fill <sel> ""` do agent-browser (clears + sets empty) - contido na page,
  // sem disparar atalhos OS-level. Versoes anteriores usavam triple-click +
  // Meta+a + Backspace mas Meta+a era interpretado pelo macOS como atalho de
  // sistema (abria "About This Mac") porque agent-browser nao suporta "Meta"
  // como modifier valido.
  runMaybe(bin, ['--cdp', String(port), 'fill', `@${ref}`, ''], port, { allowFailure: true });
}

export function takeSnapshot(bin: string, port: number): string {
  return runMaybe(bin, ['--cdp', String(port), 'snapshot', '-i'], port);
}

export function getTitle(bin: string, port: number): string {
  return runMaybe(bin, ['--cdp', String(port), 'get', 'title'], port).trim();
}

export function saveSnapshot(snapshot: string, logDir: string): void {
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'google-search-snapshot.log');
  fs.writeFileSync(logFile, snapshot + '\n');
}

export function waitForLoad(bin: string, port: number): void {
  runMaybe(bin, ['--cdp', String(port), 'wait', '--load', 'networkidle'], port);
}