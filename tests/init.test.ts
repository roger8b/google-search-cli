// tests/init.test.ts
// init in project mode (default + --agent) and global mode (--global).
// Verifies file creation, idempotency, append-on-existing, and full uninstall.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { runUninstall } from '../src/commands/uninstall.js';
import { AGENTS } from '../src/utils/agents.js';

let project: string;
let homeBackup: string | undefined;
let fakeHome: string;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'gscli-init-'));
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gscli-home-'));
  homeBackup = process.env.HOME;
  process.env.HOME = fakeHome;
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
  if (homeBackup !== undefined) process.env.HOME = homeBackup;
});

describe('runInit (project mode)', () => {
  it('creates BOTH CLAUDE.md and AGENTS.md when neither exists', async () => {
    const code = await runInit({ cwd: project });
    expect(code).toBe(0);

    const claude = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('<!-- gscli-start -->');
    expect(claude).toContain('## gscli — Google Search CLI');

    const agents = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('<!-- gscli-start -->');

    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-search/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.agents/skills/gscli-search/SKILL.md'))).toBe(true);
  });

  it('appends to an existing CLAUDE.md without losing prior content', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# existing\n\nimportant prior content\n');
    await runInit({ cwd: project });
    const content = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(content).toMatch(/^# existing/);
    expect(content).toContain('important prior content');
    expect(content).toContain('<!-- gscli-start -->');
    // The gscli section should come AFTER the existing content
    expect(content.indexOf('important prior content')).toBeLessThan(content.indexOf('<!-- gscli-start -->'));
  });

  it('is idempotent — re-running replaces the section in place', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# project\n');
    await runInit({ cwd: project });
    await runInit({ cwd: project });
    const content = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    const matches = content.match(/<!-- gscli-start -->/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('honors --agent override (targets only that agent)', async () => {
    const code = await runInit({ cwd: project, agent: 'gemini' });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(project, 'GEMINI.md'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.gemini/skills/gscli-search/SKILL.md'))).toBe(true);
    // Default agents should NOT have been touched
    expect(fs.existsSync(path.join(project, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(project, 'AGENTS.md'))).toBe(false);
  });

  it('rejects unknown agent ids', async () => {
    const code = await runInit({ cwd: project, agent: 'nope' });
    expect(code).toBe(1);
  });
});

describe('runInit (--global)', () => {
  it('installs skills for all known agents under $HOME and does not create rule files', async () => {
    const code = await runInit({ cwd: project, global: true });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(fakeHome, '.claude/skills/gscli-search/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.agents/skills/gscli-search/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.gemini/skills/gscli-search/SKILL.md'))).toBe(true);
    // Rule files are NOT created in --global mode
    expect(fs.existsSync(path.join(project, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(project, 'AGENTS.md'))).toBe(false);
  });

  it('honors --agent with --global', async () => {
    const code = await runInit({ global: true, agent: 'claude-code' });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(fakeHome, '.claude/skills/gscli-search/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.agents/skills/gscli-search/SKILL.md'))).toBe(false);
  });
});

describe('runUninstall (project mode)', () => {
  it('removes section and skills from every default agent', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# project\nbody\n');
    await runInit({ cwd: project });
    const code = await runUninstall({ cwd: project });
    expect(code).toBe(0);

    const claude = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(claude).not.toContain('<!-- gscli-start -->');
    expect(claude).toContain('# project');
    expect(claude).toContain('body');

    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-search'))).toBe(false);
    expect(fs.existsSync(path.join(project, '.agents/skills/gscli-search'))).toBe(false);
  });

  it('is a no-op when no agents present', async () => {
    const code = await runUninstall({ cwd: project });
    expect(code).toBe(0);
  });
});

describe('runUninstall (--global)', () => {
  it('removes all globally-installed gscli-* skills', async () => {
    await runInit({ global: true });
    const code = await runUninstall({ global: true });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(fakeHome, '.claude/skills/gscli-search'))).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, '.agents/skills/gscli-search'))).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, '.gemini/skills/gscli-search'))).toBe(false);
  });
});
