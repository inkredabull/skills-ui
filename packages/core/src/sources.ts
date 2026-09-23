import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SkillSource } from './types.js';

export interface DiscoverOptions {
  home?: string;
  extraDirs?: string[];
  platform?: NodeJS.Platform;
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

async function subdirs(p: string): Promise<string[]> {
  const entries = await fs.readdir(p, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(p, e.name));
}

function desktopBase(home: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Claude');
  }
  if (platform === 'linux') return path.join(home, '.config', 'Claude');
  return path.join(home, 'Library', 'Application Support', 'Claude');
}

/** Claude Desktop stores synced skills at <base>/local-agent-mode-sessions/skills-plugin/<org>/<account>/skills. */
async function desktopSources(home: string, platform: NodeJS.Platform): Promise<SkillSource[]> {
  const base = path.join(desktopBase(home, platform), 'local-agent-mode-sessions', 'skills-plugin');
  const out: SkillSource[] = [];
  for (const org of await subdirs(base)) {
    for (const account of await subdirs(org)) {
      const root = path.join(account, 'skills');
      if (await exists(path.join(account, 'manifest.json'))) {
        out.push({ kind: 'desktop', label: 'Claude Desktop', root, readOnly: true });
      }
    }
  }
  return out;
}

/** Cowork plugins synced from the account: ~/.claude/plugins/synced/<bucket>/<plugin>[~gN]/. */
async function syncedPluginSources(home: string): Promise<SkillSource[]> {
  const base = path.join(home, '.claude', 'plugins', 'synced');
  const out: SkillSource[] = [];
  for (const bucket of await subdirs(base)) {
    for (const dir of await subdirs(bucket)) {
      const plugin = path.basename(dir).replace(/~g\d+$/, '');
      out.push({
        kind: 'plugin',
        label: `${plugin} (Cowork)`,
        plugin,
        root: dir,
        readOnly: true,
      });
    }
  }
  return out;
}

interface InstalledPlugins {
  plugins?: Record<string, { installPath?: string }[]>;
}

async function pluginSources(home: string): Promise<SkillSource[]> {
  const file = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  let data: InstalledPlugins;
  try {
    data = JSON.parse(await fs.readFile(file, 'utf8')) as InstalledPlugins;
  } catch {
    return [];
  }
  const out: SkillSource[] = [];
  for (const [key, installs] of Object.entries(data.plugins ?? {})) {
    for (const inst of installs) {
      if (!inst.installPath) continue;
      out.push({
        kind: 'plugin',
        label: key,
        plugin: key.split('@')[0],
        root: inst.installPath,
        readOnly: true,
      });
    }
  }
  return out;
}

export async function discoverSources(opts: DiscoverOptions = {}): Promise<SkillSource[]> {
  const home = opts.home ?? os.homedir();
  const platform = opts.platform ?? process.platform;
  const sources: SkillSource[] = [];
  sources.push(...(await desktopSources(home, platform)));
  const userRoot = path.join(home, '.claude', 'skills');
  if (await exists(userRoot)) {
    sources.push({
      kind: 'user',
      label: 'Personal (~/.claude/skills)',
      root: userRoot,
      readOnly: false,
    });
  }
  sources.push(...(await syncedPluginSources(home)));
  sources.push(...(await pluginSources(home)));
  for (const dir of opts.extraDirs ?? []) {
    if (await exists(dir)) {
      sources.push({ kind: 'custom', label: path.basename(dir), root: dir, readOnly: false });
    }
  }
  return sources;
}
