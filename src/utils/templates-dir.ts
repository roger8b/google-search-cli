// src/utils/templates-dir.ts
// Resolves the templates directory. Works whether running from source
// (templates/ next to src/) or from the built bundle (templates/ next to dist/).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function templatesDir(): string {
  const candidates = [
    resolve(__dirname, '..', '..', 'templates'),
    resolve(__dirname, '..', '..', '..', 'templates'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`templates/ not found (looked in: ${candidates.join(', ')})`);
}
