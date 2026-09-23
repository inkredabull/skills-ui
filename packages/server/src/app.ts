import {
  buildFacets,
  categorizeAll,
  findSimilar,
  matchesQuery,
  TAXONOMY,
  OTHER,
  type Analysis,
  type Categorization,
  type Skill,
  type SkillDetail,
  type SkillSummary,
  type SimilarRef,
} from '@skills-ui/core';
import { Hono } from 'hono';
import type { OverrideStore } from './overrides.js';

export interface SkillProvider {
  load(force?: boolean): Promise<Skill[]>;
}

const DETAIL_ONLY = new Set(['body', 'file', 'dir']);
const SIMILAR_THRESHOLD = 0.55;
const MAX_CATEGORY_LENGTH = 40;

function summarize(skill: Skill, analysis: Analysis): SkillSummary {
  return {
    ...(Object.fromEntries(Object.entries(skill).filter(([key]) => !DETAIL_ONLY.has(key))) as Omit<
      Skill,
      'body' | 'file' | 'dir'
    >),
    ...analysis,
  };
}

interface Computed {
  auto: Map<string, Categorization>;
  similar: Map<string, SimilarRef[]>;
}

export function createApp(provider: SkillProvider, overrides: OverrideStore): Hono {
  const app = new Hono();

  // Analysis is derived from the skill list, so recompute only when the list changes.
  const cache = new WeakMap<Skill[], Computed>();
  const compute = (skills: Skill[]): Computed => {
    let c = cache.get(skills);
    if (!c) {
      const byId = new Map(skills.map((s) => [s.id, s]));
      const similar = new Map<string, SimilarRef[]>();
      const add = (from: string, to: string, score: number) => {
        const target = byId.get(to);
        if (!target) return;
        const list = similar.get(from) ?? [];
        list.push({ id: to, name: target.name, source: target.source.label, score });
        similar.set(from, list);
      };
      for (const p of findSimilar(skills, SIMILAR_THRESHOLD)) {
        add(p.a, p.b, p.score);
        add(p.b, p.a, p.score);
      }
      c = { auto: categorizeAll(skills), similar };
      cache.set(skills, c);
    }
    return c;
  };

  const analyze = (skill: Skill, c: Computed, manual: Record<string, string>): Analysis => {
    const auto = c.auto.get(skill.id);
    const override = manual[skill.id];
    return {
      category: override ?? auto?.category ?? OTHER,
      categorySource: override ? 'manual' : 'auto',
      confidence: override ? 1 : (auto?.confidence ?? 0),
      alternates: auto?.alternates ?? [],
      tags: auto?.tags ?? [],
      similar: c.similar.get(skill.id) ?? [],
    };
  };

  // Writes come only from the local UI; reject cross-origin requests (CSRF / DNS rebinding).
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET') {
      const origin = c.req.header('origin');
      const host = c.req.header('host');
      if (origin && new URL(origin).host !== host) return c.json({ error: 'forbidden' }, 403);
      if (!c.req.header('content-type')?.startsWith('application/json')) {
        return c.json({ error: 'expected application/json' }, 415);
      }
    }
    await next();
  });

  app.get('/api/skills', async (c) => {
    const skills = await provider.load(c.req.query('refresh') === '1');
    const [computed, manual] = [compute(skills), await overrides.all()];
    const q = c.req.query('q') ?? '';
    const result = skills
      .filter((s) => matchesQuery(s, q))
      .map((s) => summarize(s, analyze(s, computed, manual)));
    return c.json({ total: result.length, skills: result });
  });

  app.get('/api/skills/:id', async (c) => {
    const skills = await provider.load();
    const skill = skills.find((s) => s.id === c.req.param('id'));
    if (!skill) return c.json({ error: 'not found' }, 404);
    const detail: SkillDetail = {
      ...skill,
      ...analyze(skill, compute(skills), await overrides.all()),
    };
    return c.json(detail);
  });

  app.put('/api/skills/:id/category', async (c) => {
    const skills = await provider.load();
    const id = c.req.param('id');
    if (!skills.some((s) => s.id === id)) return c.json({ error: 'not found' }, 404);
    const body = (await c.req.json().catch(() => undefined)) as { category?: unknown } | undefined;
    const category = body?.category;
    if (
      category !== null &&
      (typeof category !== 'string' || !category.trim() || category.length > MAX_CATEGORY_LENGTH)
    ) {
      return c.json({ error: 'category must be a non-empty string or null' }, 400);
    }
    await overrides.set(id, category === null ? null : (category as string).trim());
    return c.json({ ok: true });
  });

  app.get('/api/categories', async (c) => {
    const skills = await provider.load();
    const computed = compute(skills);
    const manual = await overrides.all();
    const counts = new Map<string, number>();
    for (const s of skills) {
      const cat = analyze(s, computed, manual).category;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    const names = new Set([...TAXONOMY.map((t) => t.name), OTHER, ...counts.keys()]);
    return c.json(
      [...names]
        .map((name) => ({ name, count: counts.get(name) ?? 0 }))
        .sort((a, b) => b.count - a.count),
    );
  });

  app.get('/api/facets', async (c) => c.json(buildFacets(await provider.load())));

  return app;
}
