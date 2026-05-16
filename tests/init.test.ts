// tests/init.test.ts
// `runInit` / `runUninstall` non-interactive paths (via --yes / explicit opts).
//
// $HOME and CLAUDE_CONFIG_DIR are pinned to a single test-scoped temp dir
// before the agent registry is loaded, so AGENTS.{claude-code}.globalSkillsDir
// resolves into our fake home. Each test wipes the project + fake home contents
// to start clean without re-loading modules.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

// Pin env BEFORE importing modules that capture it at load time.
const realHome = process.env.HOME;
const realClaudeDir = process.env.CLAUDE_CONFIG_DIR;
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gscli-home-'));
process.env.HOME = fakeHome;
process.env.CLAUDE_CONFIG_DIR = path.join(fakeHome, '.claude');

const { runInit } = await import('../src/commands/init.js');
const { runUninstall } = await import('../src/commands/uninstall.js');

let project: string;

beforeAll(() => {
  // Pre-create the Claude config dir so detectInstalled() reports it.
  fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR!, { recursive: true });
});

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'gscli-init-'));
  // Wipe any prior global skills.
  const globalSkills = path.join(process.env.CLAUDE_CONFIG_DIR!, 'skills');
  fs.rmSync(globalSkills, { recursive: true, force: true });
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(fakeHome, { recursive: true, force: true });
  if (realHome !== undefined) process.env.HOME = realHome;
  else delete process.env.HOME;
  if (realClaudeDir !== undefined) process.env.CLAUDE_CONFIG_DIR = realClaudeDir;
  else delete process.env.CLAUDE_CONFIG_DIR;
});

describe('runInit (--yes)', () => {
  it('installs locally for the detected Claude Code agent', async () => {
    const code = await runInit({ cwd: project, yes: true });
    expect(code).toBe(0);

    expect(fs.existsSync(path.join(project, 'CLAUDE.md'))).toBe(true);
    const rule = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(rule).toContain('<!-- gscli-start -->');
    expect(rule).toContain('# gscli — Google Search CLI');

    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-search/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-history/SKILL.md'))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(project, '.gscli.json'), 'utf8'));
    expect(manifest.scope).toBe('local');
    expect(manifest.method).toBe('symlink');
    expect(manifest.agents).toContain('claude-code');
  });

  it('honors --method copy', async () => {
    await runInit({ cwd: project, yes: true, method: 'copy' });
    const skillPath = path.join(project, '.claude/skills/gscli-search');
    expect(fs.lstatSync(skillPath).isSymbolicLink()).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(project, '.gscli.json'), 'utf8'));
    expect(manifest.method).toBe('copy');
  });

  it('--scope global places skills under $HOME and leaves the project skills dir empty', async () => {
    await runInit({ cwd: project, yes: true, scope: 'global', method: 'copy' });
    const globalDir = path.join(process.env.CLAUDE_CONFIG_DIR!, 'skills/gscli-search');
    expect(fs.existsSync(globalDir)).toBe(true);
    // No project-local skills with scope=global
    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-search'))).toBe(false);
    // Rule file is still written so the agent knows about gscli (mirrors wiki CLI)
    expect(fs.existsSync(path.join(project, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.gscli.json'))).toBe(true);
  });

  it('appends the section to a pre-existing CLAUDE.md without losing content', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# project\n\nimportant prior content\n');
    await runInit({ cwd: project, yes: true });
    const content = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(content).toMatch(/^# project/);
    expect(content).toContain('important prior content');
    expect(content).toContain('<!-- gscli-start -->');
    expect(content.indexOf('important prior content')).toBeLessThan(content.indexOf('<!-- gscli-start -->'));
  });

  it('replaces the section in place when --force re-runs init', async () => {
    await runInit({ cwd: project, yes: true });
    await runInit({ cwd: project, yes: true, force: true });
    const content = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    const matches = content.match(/<!-- gscli-start -->/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('leaves the rule file untouched on re-init without --force', async () => {
    await runInit({ cwd: project, yes: true });
    const before = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    await runInit({ cwd: project, yes: true });
    const after = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(after).toBe(before);
  });
});

describe('runUninstall', () => {
  it('removes local skills, manifest, and section from rule file', async () => {
    await runInit({ cwd: project, yes: true });
    const code = await runUninstall({ cwd: project, scope: 'local' });
    expect(code).toBe(0);

    const claude = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(claude).not.toContain('<!-- gscli-start -->');

    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-search'))).toBe(false);
    expect(fs.existsSync(path.join(project, '.gscli.json'))).toBe(false);
  });

  it('removes global skills with --scope global', async () => {
    await runInit({ cwd: project, yes: true, scope: 'global', method: 'copy' });
    const code = await runUninstall({ cwd: project, scope: 'global' });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR!, 'skills/gscli-search'))).toBe(false);
  });

  it('exits 0 with a warning when nothing is installed', async () => {
    const code = await runUninstall({ cwd: project });
    expect(code).toBe(0);
  });

  it('rejects an invalid --scope instead of silent no-op', async () => {
    // @ts-expect-error — exercising the runtime guard with a bad value
    const code = await runUninstall({ cwd: project, scope: 'everywhere' });
    expect(code).toBe(1);
  });
});

describe('runInit input validation', () => {
  it('rejects an invalid --scope', async () => {
    // @ts-expect-error — runtime guard
    const code = await runInit({ cwd: project, yes: true, scope: 'nope' });
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(project, '.gscli.json'))).toBe(false);
  });

  it('rejects an invalid --method', async () => {
    // @ts-expect-error — runtime guard
    const code = await runInit({ cwd: project, yes: true, method: 'hardlink' });
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(project, 'CLAUDE.md'))).toBe(false);
  });
});
