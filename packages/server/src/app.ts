import {
  buildFacets,
  categorizeAll,
  findSimilar,
  createSkill,
  duplicateSkill,
  fileEtag,
  matchesQuery,
  restoreTrash,
  SkillWriteError,
  skillId,
  trashSkill,
  updateSkill,
  TAXONOMY,
  OTHER,
  type Analysis,
  type Categorization,
  type Skill,
  type SkillDetail,
  type SkillSummary,
  type SimilarRef,
} from '@skills-ui/core';
import { promises as fs } from 'node:fs';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { EventBus } from './events.js';
import type { MarketplaceStore } from './marketplaces.js';
import { registerPackagingRoutes } from './packaging-routes.js';
import type { OverrideStore } from './overrides.js';
import type { SkillProvider } from './provider.js';

export interface AppDeps {
  provider: SkillProvider;
  overrides: OverrideStore;
  trashDir: string;
  events?: EventBus;
  marketplaces: MarketplaceStore;
  /** Where "save to folder" marketplace exports are written. */
  exportsDir: string;
}

const STATUS = {
  invalid: 400,
  forbidden: 403,
  'not-found': 404,
  exists: 409,
  conflict: 409,
} as const;

const DETAIL_ONLY = new Set(['body', 'file', 'dir', 'root']);
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

export function createApp({
  provider,
  overrides,
  trashDir,
  events,
  marketplaces,
  exportsDir,
}: AppDeps): Hono {
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
    const etag = fileEtag(await fs.readFile(skill.file, 'utf8').catch(() => ''));
    const detail: SkillDetail = {
      ...skill,
      ...analyze(skill, compute(skills), await overrides.all()),
      etag,
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

  // --- Mutations -----------------------------------------------------------------------------

  const readJson = async (c: Context): Promise<Record<string, unknown>> => {
    const data: unknown = await c.req.json().catch(() => undefined);
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  /** Runs a write, maps SkillWriteError to an HTTP status, and refreshes the cache + live clients. */
  const mutate = async <T>(c: Context, run: () => Promise<T>) => {
    try {
      const result = await run();
      provider.invalidate();
      events?.publish();
      return c.json(result as object);
    } catch (err) {
      if (err instanceof SkillWriteError) {
        return c.json({ error: err.message, code: err.code }, STATUS[err.code]);
      }
      throw err;
    }
  };

  const targetRoot = (requested: unknown): string | undefined => {
    const root = str(requested);
    return provider.targets().find((t) => t.root === root)?.root;
  };

  app.get('/api/targets', (c) => c.json(provider.targets()));

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const off = events?.subscribe(
        () => void stream.writeSSE({ event: 'changed', data: 'changed' }),
      );
      stream.onAbort(() => off?.());
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: 'ping' });
        await stream.sleep(25_000);
      }
    }),
  );

  app.post('/api/skills', async (c) => {
    const body = await readJson(c);
    const root = targetRoot(body.root);
    if (!root) return c.json({ error: 'unknown target folder', code: 'forbidden' }, 403);
    return mutate(c, async () => {
      const file = await createSkill(root, {
        name: str(body.name),
        description: str(body.description),
        body: str(body.body),
      });
      return { id: skillId(file) };
    });
  });

  app.put('/api/skills/:id', async (c) => {
    const skill = (await provider.load()).find((s) => s.id === c.req.param('id'));
    if (!skill) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c);
    return mutate(c, async () => ({
      etag: await updateSkill(
        skill,
        { name: str(body.name), description: str(body.description), body: str(body.body) },
        str(body.etag),
      ),
    }));
  });

  app.post('/api/skills/:id/duplicate', async (c) => {
    const skill = (await provider.load()).find((s) => s.id === c.req.param('id'));
    if (!skill) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c);
    const root = targetRoot(body.root);
    if (!root) return c.json({ error: 'unknown target folder', code: 'forbidden' }, 403);
    return mutate(c, async () => ({
      id: skillId(await duplicateSkill(skill, root, str(body.name))),
    }));
  });

  app.delete('/api/skills/:id', async (c) => {
    const skill = (await provider.load()).find((s) => s.id === c.req.param('id'));
    if (!skill) return c.json({ error: 'not found' }, 404);
    return mutate(c, async () => {
      const entry = await trashSkill(skill, trashDir);
      await overrides.set(skill.id, null);
      return entry;
    });
  });

  app.post('/api/trash/:trashId/restore', (c) =>
    mutate(c, async () => {
      const dir = await restoreTrash(trashDir, c.req.param('trashId'));
      return { id: skillId(`${dir}/SKILL.md`) };
    }),
  );

  registerPackagingRoutes(app, { provider, marketplaces, exportsDir });

  app.get('/api/facets', async (c) => c.json(buildFacets(await provider.load())));

  return app;
}
