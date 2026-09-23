import { discoverSources, scanAll, type Skill } from '@skills-ui/core';
import type { SkillProvider } from './app.js';

const TTL_MS = 30_000;

export function createProvider(home?: string, extraDirs: string[] = []): SkillProvider {
  let cache: { at: number; skills: Skill[] } | undefined;
  return {
    async load(force = false) {
      if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.skills;
      const sources = await discoverSources({ home, extraDirs });
      cache = { at: Date.now(), skills: await scanAll(sources) };
      return cache.skills;
    },
  };
}
