// src/commands/init.ts
// Wire gscli into a project (default) or install user-level skills (--global).
//
// Project mode (default):
//   - Targets claude-code + codex (CLAUDE.md, AGENTS.md). Override with --agent.
//   - Creates the rule file if missing; appends a marker-delimited section.
//   - Re-running replaces the section in place (idempotent).
//   - Copies gscli-* skills into the per-agent skillsDir.
//
// Global mode (--global):
//   - Copies gscli-* skills into $HOME/<agent>/skills for every known agent
//     (claude-code, codex, gemini). Override with --agent.
//   - Never touches rule files (CLAUDE.md / AGENTS.md / GEMINI.md).

import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { AGENTS, type AgentConfig, DEFAULT_AGENT_IDS, GLOBAL_AGENT_IDS, globalSkillsDir } from '../utils/agents.js';
import { templatesDir } from '../utils/templates-dir.js';

export interface InitOpts {
  cwd?: string;
  agent?: string;
  force?: boolean;
  global?: boolean;
}

const MARKER_START = '<!-- gscli-start -->';
const MARKER_END = '<!-- gscli-end -->';

export async function runInit(opts: InitOpts = {}): Promise<number> {
  return opts.global ? runGlobal(opts) : runProject(opts);
}

// ── project mode ────────────────────────────────────────────────────────────

async function runProject(opts: InitOpts): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());

  const agents = resolveAgents(opts.agent, DEFAULT_AGENT_IDS);
  if (!agents) return 1;

  console.error(pc.cyan('▸ gscli init'));
  console.error(`  project: ${cwd}`);
  console.error(`  agents:  ${agents.map((a) => a.label).join(', ')}`);
  console.error('');

  const skillEntries = loadSkillEntries();
  if (skillEntries === null) return 1;

  for (const agent of agents) {
    installSkills(skillEntries, path.join(cwd, agent.skillsDir), agent.label, cwd, opts.force);

    const rulePath = path.join(cwd, agent.ruleFile);
    const created = !fs.existsSync(rulePath);
    injectSection(rulePath, agent);
    console.error(pc.green(`  ✓ ${agent.label}: ${created ? 'created' : 'updated'} ${agent.ruleFile}`));
  }

  console.error('');
  console.error(pc.green('gscli wired into project.'));
  console.error('  Try:  gscli "your query"');
  console.error('  Undo: gscli uninstall');
  return 0;
}

// ── global mode ─────────────────────────────────────────────────────────────

async function runGlobal(opts: InitOpts): Promise<number> {
  const agents = resolveAgents(opts.agent, GLOBAL_AGENT_IDS);
  if (!agents) return 1;

  console.error(pc.cyan('▸ gscli init --global'));
  console.error(`  agents: ${agents.map((a) => a.label).join(', ')}`);
  console.error(pc.dim('  (skills only — no rule files are created or modified)'));
  console.error('');

  const skillEntries = loadSkillEntries();
  if (skillEntries === null) return 1;

  for (const agent of agents) {
    const dst = globalSkillsDir(agent);
    installSkills(skillEntries, dst, agent.label, dst, opts.force);
  }

  console.error('');
  console.error(pc.green('gscli skills installed globally.'));
  console.error('  Undo: gscli uninstall --global');
  return 0;
}

// ── shared helpers ──────────────────────────────────────────────────────────

function resolveAgents(agentFlag: string | undefined, defaults: string[]): AgentConfig[] | null {
  if (agentFlag) {
    const a = AGENTS[agentFlag];
    if (!a) {
      console.error(pc.red(`✗ unknown agent: ${agentFlag}`));
      console.error(`  known: ${Object.keys(AGENTS).join(', ')}`);
      return null;
    }
    return [a];
  }
  return defaults.map((id) => AGENTS[id]);
}

function loadSkillEntries(): string[] | null {
  const tdir = templatesDir();
  const skillsSrc = path.join(tdir, 'skills');
  if (!fs.existsSync(skillsSrc)) {
    console.error(pc.red(`✗ skills templates missing at ${skillsSrc}`));
    return null;
  }
  return fs.readdirSync(skillsSrc, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('gscli-'))
    .map((e) => e.name);
}

function installSkills(skillEntries: string[], dstRoot: string, label: string, displayRoot: string, force: boolean | undefined): void {
  const tdir = templatesDir();
  const skillsSrc = path.join(tdir, 'skills');
  fs.mkdirSync(dstRoot, { recursive: true });
  for (const skill of skillEntries) {
    const from = path.join(skillsSrc, skill);
    const to = path.join(dstRoot, skill);
    if (fs.existsSync(to) && !force) {
      console.error(pc.dim(`  · ${label}: ${skill} already present (use --force to overwrite)`));
      continue;
    }
    if (fs.existsSync(to) && force) {
      fs.rmSync(to, { recursive: true, force: true });
    }
    copyDir(from, to);
    const shown = path.relative(displayRoot, to) || to;
    console.error(pc.green(`  ✓ ${label}: installed ${skill} → ${shown}`));
  }
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function injectSection(rulePath: string, agent: AgentConfig): void {
  const body = renderSection(agent);
  let content = '';
  if (fs.existsSync(rulePath)) {
    content = fs.readFileSync(rulePath, 'utf8');
  }
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + MARKER_END.length);
    content = `${before}${body}${after}`;
  } else {
    if (content && !content.endsWith('\n')) content += '\n';
    content += `\n${body}\n`;
  }
  fs.mkdirSync(path.dirname(rulePath), { recursive: true });
  fs.writeFileSync(rulePath, content);
}

function renderSection(agent: AgentConfig): string {
  return `${MARKER_START}
## gscli — Google Search CLI

The user runs Google searches through the \`gscli\` CLI (logged-in Chrome via CDP, AI Mode, persistent history). Prefer \`gscli\` over generic WebSearch/WebFetch when fresh facts, recent news, or external links are needed.

**Skills:** \`${agent.skillsDir}/gscli-*/SKILL.md\` (project-local) or \`~/${agent.globalSkillsRel}/gscli-*/SKILL.md\` (user-level)

| To … | Use … |
|------|-------|
| Run a Google search | \`gscli "<query>"\` |
| Use Google AI Mode | \`gscli "<query>" --ai\` |
| Multi-turn AI Mode | \`gscli "<q>" --ai -c -f "follow-up"\` |
| Merge recent searches | \`gscli --merge-history --merge-limit 5\` |
| Cache same query | \`gscli "<q>" --use-cache\` |
| Health check | \`gscli doctor\` |
| Full options | \`gscli --help\` |

**Rules:**
- Never read or write files under \`~/.gscli/chrome-profile\` — it's session state.
- Never edit \`~/.gscli/history/searches.jsonl\` by hand — append-only.
- Exit code 2 = blocked (CAPTCHA); surface to the user, do not retry blindly.
${MARKER_END}`;
}
