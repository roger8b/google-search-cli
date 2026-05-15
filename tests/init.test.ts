// tests/init.test.ts
// init copies skills + injects section; uninstall reverses both. Idempotent.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { runUninstall } from '../src/commands/uninstall.js';

let project: string;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'gscli-init-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

describe('runInit', () => {
  it('warns and exits 1 when no rule file is present', async () => {
    const code = await runInit({ cwd: project });
    expect(code).toBe(1);
  });

  it('detects CLAUDE.md and installs skills + section', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# project\n\nexisting body\n');
    const code = await runInit({ cwd: project });
    expect(code).toBe(0);

    const skillsDir = path.join(project, '.claude/skills');
    expect(fs.existsSync(path.join(skillsDir, 'gscli-search/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'gscli-history/SKILL.md'))).toBe(true);

    const rule = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(rule).toContain('# project');
    expect(rule).toContain('existing body');
    expect(rule).toContain('<!-- gscli-start -->');
    expect(rule).toContain('<!-- gscli-end -->');
    expect(rule).toContain('## gscli — Google Search CLI');
  });

  it('is idempotent — re-running replaces the section in place', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# project\n');
    await runInit({ cwd: project });
    await runInit({ cwd: project });
    const rule = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    const startCount = (rule.match(/<!-- gscli-start -->/g) ?? []).length;
    expect(startCount).toBe(1);
  });

  it('honors --agent override', async () => {
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# codex\n');
    const code = await runInit({ cwd: project, agent: 'codex' });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(project, '.agents/skills/gscli-search/SKILL.md'))).toBe(true);
  });

  it('rejects unknown agent ids', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '');
    const code = await runInit({ cwd: project, agent: 'nope' });
    expect(code).toBe(1);
  });
});

describe('runUninstall', () => {
  it('removes the section and gscli-* skills', async () => {
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# project\nbody\n');
    await runInit({ cwd: project });
    const code = await runUninstall({ cwd: project });
    expect(code).toBe(0);

    const rule = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8');
    expect(rule).not.toContain('<!-- gscli-start -->');
    expect(rule).not.toContain('## gscli');
    expect(rule).toContain('# project');
    expect(rule).toContain('body');

    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-search'))).toBe(false);
    expect(fs.existsSync(path.join(project, '.claude/skills/gscli-history'))).toBe(false);
  });

  it('is a no-op when no agents detected', async () => {
    const code = await runUninstall({ cwd: project });
    expect(code).toBe(0);
  });
});
