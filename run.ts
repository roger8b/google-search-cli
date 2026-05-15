#!/usr/bin/env node
/**
 * Google Search Script - Entry point
 * 
 * This file is kept for backwards compatibility.
 * The actual implementation is in src/index.ts
 */

import { main } from './src/index.js';

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`[google-search] ERROR: ${message}\n`);
    process.exit(1);
  });