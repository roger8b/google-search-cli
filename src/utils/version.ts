// src/utils/version.ts
// Single source of truth for the gscli version — read from package.json at
// runtime so we never drift.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readVersion(): string {
  const candidates = [
    resolve(__dirname, '..', '..', 'package.json'),
    resolve(__dirname, '..', '..', '..', 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return '0.0.0';
}

export const VERSION = readVersion();
