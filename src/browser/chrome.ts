// src/browser/chrome.ts
// Chrome process management with remote debugging.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { portOpen, waitForCdp } from './connect.js';
import { Config } from '../config/index.js';

export async function startChromeIfNeeded(config: Config): Promise<void> {
  if (await portOpen(config.port)) {
    log(`CDP already answering on ${config.port}`);
    return;
  }

  if (!fs.existsSync(config.chromeBin)) {
    throw new Error(`Chrome binary not found at: ${config.chromeBin}`);
  }

  fs.mkdirSync(config.profileDir, { recursive: true });
  const launchLog = path.join(config.startLogDir, `chrome-${config.port}.log`);
  const logFd = fs.openSync(launchLog, 'a');

  log(`Starting Chrome with remote debugging on ${config.port}`);
  const child = spawn(config.chromeBin, [
    `--remote-debugging-port=${config.port}`,
    `--user-data-dir=${config.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  const ready = await waitForCdp(config.port);
  if (!ready) {
    log(`Chrome started but CDP never responded. Last log: ${launchLog}`);
    try {
      const tail = fs.readFileSync(launchLog, 'utf8').trim().split('\n').slice(-20).join('\n');
      if (tail) process.stdout.write(`${tail}\n`);
    } catch {
      // ignore
    }
    throw new Error('CDP did not become ready');
  }

  log('Chrome CDP is ready');
}

function log(message: string): void {
  process.stderr.write(`[google-search] ${message}\n`);
}