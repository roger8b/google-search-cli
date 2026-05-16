// src/commands/init.ts
// `gscli init` — interactive (or --yes) project wiring.
//
// Modeled after llm-wiki-cli's project init: detects every supported agent on
// the machine, lets the user pick which ones to wire, installs gscli-* skills
// at the chosen scope (local / global / both) using symlink or copy, writes
// a marker-delimited section to each agent's rule file (CLAUDE.md, AGENTS.md,
// GEMINI.md, .clinerules, .cursor/rules/gscli.mdc, etc.), and records a
// `.gscli.json` manifest in the project root.

import path from 'node:path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { checkbox, select } from '@inquirer/prompts';
import { AGENTS, type AgentConfig, type AgentId, detectInstalledAgents } from '../utils/agents.js';
import { templatesDir } from '../utils/templates-dir.js';

export interface InitOpts {
  cwd?: string;
  force?: boolean;
  yes?: boolean;
  scope?: 'local' | 'global' | 'both';
  method?: 'symlink' | 'copy';
  showAll?: boolean;
  update?: boolean;
}

type Scope = 'local' | 'global' | 'both';
type Method = 'symlink' | 'copy';
type ExistingAction = 'keep' | 'update' | 'remove' | 'ask-each';

function isScope(v: unknown): v is Scope {
  return v === 'local' || v === 'global' || v === 'both';
}

function isMethod(v: unknown): v is Method {
  return v === 'symlink' || v === 'copy';
}

const GSCLI_START = '<!-- gscli-start -->';
const GSCLI_END = '<!-- gscli-end -->';

// ── content generators ──────────────────────────────────────────────────────

function boilerplate(agentId: string): string {
  const def = AGENTS[agentId];
  const skillsDir = def?.skillsDir ?? '.agents/skills';
  const globalSkillsDir = def?.globalSkillsDir ?? '~/.claude/skills';
  return `${GSCLI_START}
# gscli — Google Search CLI

The user has \`gscli\` installed — a CLI that drives a logged-in Chrome over CDP to run Google searches (regular SERP or Google AI Mode) and returns structured JSON. Prefer \`gscli\` over generic WebSearch / WebFetch when fresh facts, recent news, or external links are needed.

**Skills:**
- Local: \`${skillsDir}/gscli-*/SKILL.md\`
- Global: \`${globalSkillsDir}/gscli-*/SKILL.md\`

| To … | Use … |
|------|-------|
| Run a Google search | \`gscli "<query>"\` |
| Google AI Mode | \`gscli "<query>" --ai\` |
| Multi-turn AI Mode | \`gscli "<q>" --ai -c -f "follow-up"\` |
| Merge recent searches | \`gscli --merge-history --merge-limit 5\` |
| Cache same query | \`gscli "<q>" --use-cache\` |
| Health check | \`gscli doctor\` |
| Full options | \`gscli --help\` |

## Hard rules

- Never read or write files under \`~/.gscli/chrome-profile\` — it's live browser session state.
- Never edit \`~/.gscli/history/searches.jsonl\` by hand — append-only; \`--use-cache\` and \`--merge-history\` depend on its ordering.
- Exit code 2 = blocked (CAPTCHA / unusual traffic). Surface to the user, do not retry blindly.
- Never bypass the per-port lock with \`--no-lock\` — parallel runs on the same Chrome interleave keystrokes character-by-character.
${GSCLI_END}
`;
}

function cursorRule(): string {
  return `---
description: gscli — Google Search CLI; prefer for fresh-info searches
alwaysApply: true
---

${GSCLI_START}
The user has \`gscli\` installed. It drives a logged-in Chrome over CDP and returns structured Google SERP JSON. Prefer \`gscli\` over WebSearch / WebFetch for fresh facts, recent news, or external links.

- All search operations go through the \`gscli\` CLI. Run \`gscli --help\`.
- Load skills from \`.agents/skills/gscli-*/SKILL.md\` when triggers apply.
- Never touch \`~/.gscli/chrome-profile\` or \`~/.gscli/history/searches.jsonl\` directly.
${GSCLI_END}
`;
}

// ── file helpers ────────────────────────────────────────────────────────────

async function writeRuleFile(
  file: string,
  content: string,
  appendOk: boolean,
  force: boolean,
): Promise<'wrote' | 'appended' | 'skipped'> {
  await fs.ensureDir(path.dirname(file));

  if (!fs.existsSync(file)) {
    await fs.writeFile(file, content);
    return 'wrote';
  }

  const existing = await fs.readFile(file, 'utf8');

  if (existing.includes(GSCLI_START)) {
    if (!force) return 'skipped';
    const replaced = existing.replace(
      new RegExp(`${GSCLI_START}[\\s\\S]*?${GSCLI_END}\\n?`, 'm'),
      content,
    );
    await fs.writeFile(file, replaced);
    return 'wrote';
  }

  if (appendOk) {
    await fs.appendFile(file, '\n' + content);
    return 'appended';
  }

  if (force) {
    await fs.writeFile(file, content);
    return 'wrote';
  }

  return 'skipped';
}

// ── skills helpers ──────────────────────────────────────────────────────────

async function detectSkillsAt(dir: string): Promise<{ count: number; isSymlink: boolean }> {
  if (!fs.existsSync(dir)) return { count: 0, isSymlink: false };
  let count = 0;
  let isSymlink = false;
  try {
    const entries = await fs.readdir(dir);
    for (const e of entries) {
      const p = path.join(dir, e);
      if (e.startsWith('gscli-') && fs.existsSync(path.join(p, 'SKILL.md'))) count++;
    }
    const gscliEntry = entries.find((e) => e.startsWith('gscli-'));
    if (gscliEntry) isSymlink = fs.lstatSync(path.join(dir, gscliEntry)).isSymbolicLink();
  } catch { /* ignore */ }
  return { count, isSymlink };
}

async function installSkills(
  destDir: string,
  srcDir: string,
  method: Method,
  force: boolean,
): Promise<number> {
  await fs.ensureDir(destDir);
  const entries = await fs.readdir(srcDir);
  let installed = 0;

  for (const e of entries) {
    if (!e.startsWith('gscli-')) continue;
    const from = path.join(srcDir, e);
    const to = path.join(destDir, e);

    let entryExists = false;
    try { fs.lstatSync(to); entryExists = true; } catch { /* truly absent */ }

    if (entryExists && !force) continue;
    if (entryExists) { try { await fs.remove(to); } catch { /* ignore */ } }

    if (method === 'symlink') {
      try {
        await fs.ensureSymlink(from, to, 'dir');
      } catch {
        await fs.copy(from, to, { overwrite: true });
      }
    } else {
      await fs.copy(from, to, { overwrite: true });
    }
    installed++;
  }
  return installed;
}

async function removeGscliSkills(dir: string): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const entries = await fs.readdir(dir);
  for (const e of entries) {
    if (!e.startsWith('gscli-')) continue;
    await fs.remove(path.join(dir, e));
    removed++;
  }
  return removed;
}

function resolveSkillsDestForAgent(target: string, def: AgentConfig, scope: Scope): string[] {
  const dests: string[] = [];
  if (scope === 'local' || scope === 'both') dests.push(path.join(target, def.skillsDir));
  if (scope === 'global' || scope === 'both') dests.push(def.globalSkillsDir);
  return dests;
}

// ── main command ────────────────────────────────────────────────────────────

export async function runInit(opts: InitOpts = {}): Promise<number> {
  const target = path.resolve(opts.cwd ?? '.');
  if (opts.scope !== undefined && !isScope(opts.scope)) {
    console.error(pc.red(`invalid --scope: ${String(opts.scope)} (expected local | global | both)`));
    return 1;
  }
  if (opts.method !== undefined && !isMethod(opts.method)) {
    console.error(pc.red(`invalid --method: ${String(opts.method)} (expected symlink | copy)`));
    return 1;
  }
  if (!fs.existsSync(target)) {
    console.error(pc.red(`target not found: ${target}`));
    return 1;
  }

  console.log(pc.dim(`project: ${target}`));
  console.log();

  const detected = new Set(detectInstalledAgents());

  // Agents that already have gscli-* skills installed (local or global).
  // Used to pre-select checkbox items so users don't re-install accidentally.
  const alreadySetup = new Set<AgentId>();
  for (const [id, def] of Object.entries(AGENTS)) {
    const localCount = (await detectSkillsAt(path.join(target, def.skillsDir))).count;
    const globalCount = (await detectSkillsAt(def.globalSkillsDir)).count;
    if (localCount > 0 || globalCount > 0) alreadySetup.add(id);
  }

  // ── select agents ────────────────────────────────────────────────────────
  let selectedAgents: AgentId[];
  if (opts.yes) {
    if (alreadySetup.size > 0) selectedAgents = Array.from(alreadySetup);
    else if (detected.size > 0) selectedAgents = Array.from(detected);
    else selectedAgents = ['claude-code'];
  } else {
    const showAll = opts.showAll;
    const visible = Object.entries(AGENTS).filter(([id]) =>
      showAll || detected.has(id) || alreadySetup.has(id) || id === 'claude-code',
    );
    selectedAgents = await checkbox<AgentId>({
      message: showAll
        ? `Agents (${Object.keys(AGENTS).length} total — use space to toggle)`
        : `Detected agents (${detected.size} found, ${alreadySetup.size} with gscli skills already set up)`,
      choices: visible.map(([id, def]) => {
        const tags: string[] = [];
        if (alreadySetup.has(id)) tags.push(pc.cyan('(gscli set up)'));
        else if (detected.has(id)) tags.push(pc.green('(detected)'));
        return {
          name: tags.length ? `${def.displayName} ${tags.join(' ')}` : def.displayName,
          value: id,
          checked: alreadySetup.has(id),
        };
      }),
    });
  }

  if (selectedAgents.length === 0) {
    console.log(pc.yellow('no agents selected — nothing to do.'));
    return 0;
  }

  // ── scope ────────────────────────────────────────────────────────────────
  const scope: Scope = opts.scope ?? (
    opts.yes
      ? 'local'
      : await select<Scope>({
          message: 'Install skills where?',
          choices: [
            { name: 'Local   (inside project, per agent dir)', value: 'local' },
            { name: 'Global  (in each agent\'s home dir)', value: 'global' },
            { name: 'Both    (local + global)', value: 'both' },
          ],
        })
  );

  // ── method ───────────────────────────────────────────────────────────────
  const method: Method = opts.method ?? (
    opts.yes
      ? 'symlink'
      : await select<Method>({
          message: 'Skills installation method:',
          choices: [
            { name: 'Symlink  (recommended — auto-updates when CLI updates skills)', value: 'symlink' },
            { name: 'Copy     (static snapshot)', value: 'copy' },
          ],
        })
  );

  // ── compute unique skill destinations (dedup shared dirs) ────────────────
  const destToAgents = new Map<string, AgentId[]>();
  for (const id of selectedAgents) {
    const def = AGENTS[id];
    if (!def) continue;
    for (const dest of resolveSkillsDestForAgent(target, def, scope)) {
      const list = destToAgents.get(dest) ?? [];
      list.push(id);
      destToAgents.set(dest, list);
    }
  }

  // ── existing skills handling ─────────────────────────────────────────────
  const destsWithExisting: Array<{ dest: string; count: number; isSymlink: boolean }> = [];
  for (const dest of destToAgents.keys()) {
    const s = await detectSkillsAt(dest);
    if (s.count > 0) destsWithExisting.push({ dest, ...s });
  }

  let existingAction: ExistingAction = 'update';
  if (destsWithExisting.length > 0 && !opts.update && !opts.force) {
    if (opts.yes) {
      existingAction = 'update';
    } else {
      const total = destsWithExisting.reduce((s, d) => s + d.count, 0);
      existingAction = await select<ExistingAction>({
        message: `Found ${total} gscli skill(s) across ${destsWithExisting.length} location(s). Action?`,
        choices: [
          { name: 'Update    (re-sync all from gscli templates)', value: 'update' },
          { name: 'Keep      (don\'t touch existing)', value: 'keep' },
          { name: 'Remove    (wipe gscli-* then reinstall)', value: 'remove' },
          { name: 'Ask each  (prompt per location)', value: 'ask-each' },
        ],
      });
    }
  } else if (opts.update) {
    existingAction = 'update';
  }

  const td = templatesDir();
  const srcSkillsDir = path.join(td, 'skills');
  if (!fs.existsSync(srcSkillsDir)) {
    console.error(pc.red(`skills templates not found at ${srcSkillsDir}. Reinstall the CLI.`));
    return 1;
  }

  // ── install skills per destination ───────────────────────────────────────
  console.log();
  for (const [dest, agentIds] of destToAgents) {
    const rel = path.relative(target, dest) || dest;
    const label = agentIds.length > 1
      ? `${rel} ${pc.dim(`(shared: ${agentIds.map((a) => AGENTS[a].displayName).join(', ')})`)}`
      : `${rel} ${pc.dim(`(${AGENTS[agentIds[0]].displayName})`)}`;
    console.log(pc.bold(label));

    let force = !!opts.force;
    let skipDest = false;
    const existing = destsWithExisting.find((d) => d.dest === dest);
    if (existing) {
      let action: ExistingAction = existingAction;
      if (action === 'ask-each') {
        action = await select<ExistingAction>({
          message: `  ${rel}: ${existing.count} gscli skill(s) ${existing.isSymlink ? '(symlinked)' : '(copied)'}. Action?`,
          choices: [
            { name: 'Update', value: 'update' },
            { name: 'Keep', value: 'keep' },
            { name: 'Remove', value: 'remove' },
          ],
        });
      }
      if (action === 'keep') {
        console.log(pc.dim(`  keeping ${existing.count} existing skill(s)`));
        skipDest = true;
      } else if (action === 'remove') {
        const n = await removeGscliSkills(dest);
        console.log(pc.dim(`  removed ${n} gscli skill(s)`));
        force = true;
      } else if (action === 'update') {
        force = true;
      }
    }

    if (!skipDest) {
      const n = await installSkills(dest, srcSkillsDir, method, force);
      const verb = method === 'symlink' ? 'symlinked' : 'copied';
      console.log(pc.green(`  ✓ ${n} skill(s) ${verb}`));
    }
  }

  // ── rule files per agent (dedup shared files like AGENTS.md) ─────────────
  console.log();
  const writtenRuleFiles = new Map<string, AgentId>();
  for (const agentId of selectedAgents) {
    const def = AGENTS[agentId];
    if (!def) continue;
    const ruleAbs = path.join(target, def.ruleFile);
    const content = def.ruleFormat === 'cursor' ? cursorRule() : boilerplate(agentId);

    if (writtenRuleFiles.has(def.ruleFile)) {
      console.log(pc.dim(`  shared rule file already written: ${def.ruleFile} (${AGENTS[writtenRuleFiles.get(def.ruleFile)!].displayName})`));
      continue;
    }
    writtenRuleFiles.set(def.ruleFile, agentId);
    const result = await writeRuleFile(ruleAbs, content, def.appendOk, !!opts.force);
    const rel = path.relative(target, ruleAbs);
    if (result === 'wrote') console.log(pc.green(`  ✓ wrote ${rel}`));
    else if (result === 'appended') console.log(pc.green(`  ✚ appended to ${rel}`));
    else console.log(pc.yellow(`  skip (already has gscli section): ${rel}`));
  }

  // ── .gscli.json manifest ─────────────────────────────────────────────────
  // Always refresh: a later init can change agents/scope/method, and the
  // global uninstall path relies on this manifest for non-detected agents.
  const configPath = path.join(target, '.gscli.json');
  await fs.writeJson(
    configPath,
    {
      agents: selectedAgents,
      scope,
      method,
      version: 1,
      installed_at: new Date().toISOString(),
    },
    { spaces: 2 },
  );
  console.log(pc.green(`\n✓ wrote .gscli.json`));

  console.log(pc.green(`\n✓ project wired to gscli. Run \`gscli doctor\` to verify.`));
  return 0;
}
