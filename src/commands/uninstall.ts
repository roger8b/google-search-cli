// src/commands/uninstall.ts
// Reverse of `gscli init`. Walks every agent's project skillsDir (when scope
// includes "local") and globalSkillsDir (when scope includes "global"),
// removes all gscli-* skills, and strips the marker-delimited section from
// every detected rule file. Also deletes `.gscli.json` when removing locally.

import path from 'node:path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { AGENTS, type AgentId, detectInstalledAgents } from '../utils/agents.js';

export interface UninstallOpts {
  cwd?: string;
  agent?: string;
  scope?: 'local' | 'global' | 'both';
  yes?: boolean;
}

type Scope = 'local' | 'global' | 'both';

function isScope(v: unknown): v is Scope {
  return v === 'local' || v === 'global' || v === 'both';
}

const GSCLI_START = '<!-- gscli-start -->';
const GSCLI_END = '<!-- gscli-end -->';

export async function runUninstall(opts: UninstallOpts = {}): Promise<number> {
  const target = path.resolve(opts.cwd ?? '.');
  if (opts.scope !== undefined && !isScope(opts.scope)) {
    console.error(pc.red(`invalid --scope: ${String(opts.scope)} (expected local | global | both)`));
    return 1;
  }
  const scope: Scope = opts.scope ?? 'local';

  // Decide which agents to act on. If --agent given, use only that one;
  // otherwise look at the manifest, the project rule files, and the
  // global home directories.
  const agentIds = await resolveAgents(target, opts.agent, scope);
  if (agentIds.length === 0) {
    console.error(pc.yellow('! no gscli installations found to remove'));
    return 0;
  }

  console.log(pc.dim(`project: ${target}`));
  console.log(pc.dim(`scope:   ${scope}`));
  console.log(pc.dim(`agents:  ${agentIds.map((id) => AGENTS[id]?.displayName ?? id).join(', ')}`));
  console.log();

  // Track shared rule files so we don't strip the same file twice.
  const cleanedRuleFiles = new Set<string>();

  for (const id of agentIds) {
    const def = AGENTS[id];
    if (!def) continue;

    const dests: string[] = [];
    if (scope === 'local' || scope === 'both') dests.push(path.join(target, def.skillsDir));
    if (scope === 'global' || scope === 'both') dests.push(def.globalSkillsDir);

    for (const dest of dests) {
      const removed = await removeGscliSkills(dest);
      if (removed > 0) {
        const rel = path.relative(target, dest);
        console.log(pc.green(`  ✓ removed ${removed} gscli skill(s) from ${rel || dest}`));
      }
    }

    if (scope === 'local' || scope === 'both') {
      const rulePath = path.join(target, def.ruleFile);
      if (!cleanedRuleFiles.has(rulePath)) {
        cleanedRuleFiles.add(rulePath);
        if (await cleanRuleFile(rulePath)) {
          console.log(pc.green(`  ✓ cleaned ${path.relative(target, rulePath)}`));
        }
      }
    }
  }

  // Drop the manifest only when fully uninstalling locally.
  if (scope === 'local' || scope === 'both') {
    const configPath = path.join(target, '.gscli.json');
    if (fs.existsSync(configPath)) {
      await fs.remove(configPath);
      console.log(pc.green('  ✓ removed .gscli.json'));
    }
  }

  console.log(pc.green('\n✓ gscli uninstalled.'));
  return 0;
}

async function resolveAgents(target: string, agentFlag: string | undefined, scope: Scope): Promise<AgentId[]> {
  if (agentFlag) {
    return AGENTS[agentFlag] ? [agentFlag] : [];
  }

  const ids = new Set<AgentId>();

  // From manifest.
  const configPath = path.join(target, '.gscli.json');
  if (fs.existsSync(configPath)) {
    try {
      const manifest = await fs.readJson(configPath) as { agents?: AgentId[] };
      for (const a of manifest.agents ?? []) ids.add(a);
    } catch { /* ignore malformed */ }
  }

  // From local rule files / skill dirs.
  if (scope === 'local' || scope === 'both') {
    for (const [id, def] of Object.entries(AGENTS)) {
      const rulePath = path.join(target, def.ruleFile);
      const skillsPath = path.join(target, def.skillsDir);
      if (fs.existsSync(rulePath) && fs.readFileSync(rulePath, 'utf8').includes(GSCLI_START)) ids.add(id);
      if (await hasGscliSkills(skillsPath)) ids.add(id);
    }
  }

  // From global skill dirs of detected agents.
  if (scope === 'global' || scope === 'both') {
    for (const id of detectInstalledAgents()) {
      const def = AGENTS[id];
      if (def && await hasGscliSkills(def.globalSkillsDir)) ids.add(id);
    }
  }

  return Array.from(ids);
}

async function hasGscliSkills(dir: string): Promise<boolean> {
  if (!fs.existsSync(dir)) return false;
  try {
    const entries = await fs.readdir(dir);
    return entries.some((e) => e.startsWith('gscli-'));
  } catch { return false; }
}

async function removeGscliSkills(dir: string): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  try {
    const entries = await fs.readdir(dir);
    for (const e of entries) {
      if (!e.startsWith('gscli-')) continue;
      await fs.remove(path.join(dir, e));
      removed++;
    }
  } catch { /* ignore */ }
  return removed;
}

async function cleanRuleFile(rulePath: string): Promise<boolean> {
  if (!fs.existsSync(rulePath)) return false;
  const content = await fs.readFile(rulePath, 'utf8');
  if (!content.includes(GSCLI_START)) return false;
  const stripped = content.replace(
    new RegExp(`\\n?${GSCLI_START}[\\s\\S]*?${GSCLI_END}\\n?`, 'm'),
    '',
  );
  await fs.writeFile(rulePath, stripped);
  return true;
}
