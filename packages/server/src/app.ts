import { buildFacets, matchesQuery, type Skill } from '@skills-ui/core';
import { Hono } from 'hono';

export interface SkillProvider {
  load(force?: boolean): Promise<Skill[]>;
}

/** Skill list payload: the body is omitted, the detail endpoint returns it. */
type SkillSummary = Omit<Skill, 'body' | 'file' | 'dir'>;

const DETAIL_ONLY = new Set(['body', 'file', 'dir']);

function summarize(skill: Skill): SkillSummary {
  return Object.fromEntries(
    Object.entries(skill).filter(([key]) => !DETAIL_ONLY.has(key)),
  ) as SkillSummary;
}

export function createApp(provider: SkillProvider): Hono {
  const app = new Hono();

  app.get('/api/skills', async (c) => {
    const q = c.req.query('q') ?? '';
    const skills = (await provider.load(c.req.query('refresh') === '1')).filter((s) =>
      matchesQuery(s, q),
    );
    return c.json({ total: skills.length, skills: skills.map(summarize) });
  });

  app.get('/api/skills/:id', async (c) => {
    const skill = (await provider.load()).find((s) => s.id === c.req.param('id'));
    if (!skill) return c.json({ error: 'not found' }, 404);
    return c.json({ ...skill, file: skill.file, dir: skill.dir });
  });

  app.get('/api/facets', async (c) => c.json(buildFacets(await provider.load())));

  return app;
}
