import os from 'node:os';
import path from 'node:path';
import { discoverSources, scanAll, type Skill, type SkillSource } from '@skills-ui/core';

const TTL_MS = 30_000;

export interface SkillTarget {
  root: string;
  label: string;
}

export interface SkillProvider {
  load(force?: boolean): Promise<Skill[]>;
  /** Editable folders where new skills may be created or duplicated into. */
  targets(): SkillTarget[];
  /** Directories worth watching for live updates. */
  watchRoots(): Promise<string[]>;
  invalidate(): void;
}

export function createProvider(home = os.homedir(), extraDirs: string[] = []): SkillProvider {
  let cache: { at: number; skills: Skill[] } | undefined;
  const sources = (): Promise<SkillSource[]> => discoverSources({ home, extraDirs });
  return {
    async load(force = false) {
      if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.skills;
      cache = { at: Date.now(), skills: await scanAll(await sources()) };
      return cache.skills;
    },
    targets: () => [
      { root: path.join(home, '.claude', 'skills'), label: 'Personal (~/.claude/skills)' },
      ...extraDirs.map((root) => ({ root, label: path.basename(root) })),
    ],
    async watchRoots() {
      // Plugin folders rarely change and can be huge; watch what users edit plus the Desktop store.
      return (await sources())
        .filter((s) => !s.readOnly || s.kind === 'desktop')
        .map((s) => s.root);
    },
    invalidate() {
      cache = undefined;
    },
  };
}
