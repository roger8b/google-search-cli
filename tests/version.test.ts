import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/utils/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));

describe('VERSION', () => {
  it('matches package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
