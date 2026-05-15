// src/commands/setup.ts
// One-time interactive Chrome setup: launches a debuggable Chrome with a
// persistent profile dir and waits for the user to complete Google login.
//
// Important: this opens a SEPARATE Chrome process using a dedicated
// --user-data-dir. Your personal Chrome (default profile) is untouched and
// can stay open. Multiple Chrome processes with distinct profile dirs are
// supported by Chromium.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execSync } from 'node:child_process';
import pc from 'picocolors';
import { portOpen, waitForCdp } from '../browser/connect.js';
import { DEFAULT_CONFIG } from '../config/index.js';

export interface SetupOpts {
  port?: string | number;
  profileDir?: string;
  chromeBin?: string;
  force?: boolean;
  reuse?: boolean;
}

export async function runSetup(opts: SetupOpts = {}): Promise<number> {
  const port = Number(opts.port ?? DEFAULT_CONFIG.port);
  const profileDir = opts.profileDir ?? DEFAULT_CONFIG.profileDir;
  const chromeBin = opts.chromeBin ?? DEFAULT_CONFIG.chromeBin;

  console.error(pc.cyan('▸ gscli setup'));
  console.error(`  port:        ${port}`);
  console.error(`  profile dir: ${profileDir}`);
  console.error(`  chrome:      ${chromeBin}`);
  console.error(pc.dim('  (uses a separate profile — your personal Chrome is not affected)'));
  console.error('');

  if (!Number.isFinite(port) || port <= 0) {
    console.error(pc.red(`✗ invalid port: ${port}`));
    return 1;
  }
  if (!fs.existsSync(chromeBin)) {
    console.error(pc.red(`✗ Chrome binary not found: ${chromeBin}`));
    console.error('  Pass --chrome-bin <path> or set CHROME_BIN env var.');
    return 1;
  }

  const alreadyUp = await portOpen(port);

  if (alreadyUp && opts.force) {
    console.error(pc.yellow(`! port ${port} busy — --force: killing existing Chrome on that port`));
    killChromeOnProfile(profileDir, port);
    await sleep(1500);
    if (await portOpen(port)) {
      console.error(pc.red(`✗ port ${port} still busy after kill — pick a different --port`));
      return 1;
    }
  } else if (alreadyUp && !opts.reuse) {
    console.error(pc.yellow(`! a Chrome with CDP is already answering on :${port}`));
    console.error(pc.dim('  reusing it (assuming previous gscli setup). To force a fresh launch,'));
    console.error(pc.dim('  re-run with --force. To use a different port, pass --port <n>.'));
    console.error('');
    return waitForLoginAndFinish(port, profileDir, /*launched=*/ false);
  }

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(DEFAULT_CONFIG.startLogDir, { recursive: true });

  const launchLog = path.join(DEFAULT_CONFIG.startLogDir, `chrome-${port}.log`);
  const logFd = fs.openSync(launchLog, 'a');

  console.error(pc.dim(`  launching Chrome debug instance (log: ${launchLog}) …`));
  const child = spawn(chromeBin, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    'https://accounts.google.com',
  ], { detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();
  fs.closeSync(logFd);

  const ready = await waitForCdp(port);
  if (!ready) {
    console.error(pc.red('✗ CDP did not respond — check the Chrome launch log'));
    return 1;
  }
  console.error(pc.green(`✓ Chrome debug window ready on CDP :${port}`));

  return waitForLoginAndFinish(port, profileDir, /*launched=*/ true);
}

async function waitForLoginAndFinish(port: number, profileDir: string, launched: boolean): Promise<number> {
  console.error('');
  console.error('  Next steps in the new Chrome window:');
  console.error('  1. Sign in to Google');
  console.error('  2. (Optional) Open https://www.google.com to confirm');
  console.error('  3. Come back here and press ENTER');
  console.error('');

  await waitForEnter();

  console.error('');
  console.error(pc.green('✓ setup complete'));
  console.error(`  profile: ${profileDir}`);
  console.error(`  CDP:     :${port}`);
  console.error('');
  console.error('  Future searches reuse this profile. You can close the debug window.');
  if (launched) {
    console.error(pc.dim('  (a closed debug Chrome is fine — gscli relaunches it on demand)'));
  }
  console.error('');
  console.error('  Try a search:');
  console.error('    gscli "agent-browser cdp mode"');
  console.error('');
  return 0;
}

function killChromeOnProfile(profileDir: string, port: number): void {
  // Best-effort: match by --user-data-dir, then by --remote-debugging-port.
  const patterns = [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`];
  for (const pat of patterns) {
    try {
      execSync(`pkill -f "${pat.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    } catch {
      // pkill returns non-zero when nothing matched — ignore.
    }
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(pc.dim('  press ENTER when login is done › '), () => {
      rl.close();
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
