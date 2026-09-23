import type { Skill, SkillDetail, SkillSummary } from '@skills-ui/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { memoryMarketplaces } from '../src/marketplaces.js';
import { memoryOverrides } from '../src/overrides.js';
import type { SkillProvider } from '../src/provider.js';

const skill = (name: string, description: string, source = 'Personal'): Skill => ({
  id: `${name}-${source}`,
  name,
  description,
  body: 'secret body',
  dir: `/x/${name}`,
  file: `/x/${name}/SKILL.md`,
  root: '/x',
  source: { kind: 'user', label: source, readOnly: false },
  updatedAt: '2026-01-01T00:00:00Z',
  frontmatter: {},
  bytes: 1,
  lines: 1,
  extras: [],
  hasScripts: false,
  warnings: [],
});

const skills = [
  skill('plan-meals', 'Plans breakfast lunch and dinner with a shopping list'),
  skill('meal-planner', 'Plans breakfast lunch and dinner with a shopping list', 'Other'),
  skill('interview-prep', 'Prepare for a job interview and resume review'),
];
const fakeProvider = (): SkillProvider => ({
  load: async () => skills,
  targets: () => [],
  watchRoots: async () => [],
  invalidate: () => undefined,
});
const makeApp = () =>
  createApp({
    provider: fakeProvider(),
    overrides: memoryOverrides(),
    trashDir: '/nonexistent-trash',
    marketplaces: memoryMarketplaces(),
    exportsDir: '/nonexistent-exports',
  });
const json = { 'content-type': 'application/json', host: 'localhost:4173' };

describe('reads', () => {
  it('lists skills without bodies or paths, with category, tags and similar', async () => {
    const data = (await (await makeApp().request('/api/skills')).json()) as {
      total: number;
      skills: SkillSummary[];
    };
    expect(data.total).toBe(3);
    const meals = data.skills.find((s) => s.id === 'plan-meals-Personal')!;
    expect(meals).not.toHaveProperty('body');
    expect(meals).not.toHaveProperty('file');
    expect(meals.category).toBe('Health & fitness');
    expect(meals.categorySource).toBe('auto');
    expect(meals.similar.map((s) => s.name)).toEqual(['meal-planner']);
  });

  it('filters by query, returns detail with body, and 404s unknown ids', async () => {
    const app = makeApp();
    const list = (await (await app.request('/api/skills?q=interview')).json()) as { total: number };
    expect(list.total).toBe(1);
    const detail = (await (
      await app.request('/api/skills/interview-prep-Personal')
    ).json()) as SkillDetail;
    expect(detail.body).toBe('secret body');
    expect((await app.request('/api/skills/nope')).status).toBe(404);
  });

  it('reports category counts including the built-in taxonomy', async () => {
    const cats = (await (await makeApp().request('/api/categories')).json()) as {
      name: string;
      count: number;
    }[];
    expect(cats.find((c) => c.name === 'Health & fitness')?.count).toBe(2);
    expect(cats.find((c) => c.name === 'Engineering')?.count).toBe(0);
  });
});

describe('category overrides', () => {
  const put = (app: ReturnType<typeof makeApp>, id: string, body: unknown, headers = json) =>
    app.request(`/api/skills/${id}/category`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

  it('applies and clears a manual category', async () => {
    const app = makeApp();
    expect((await put(app, 'plan-meals-Personal', { category: 'Family' })).status).toBe(200);
    let d = (await (await app.request('/api/skills/plan-meals-Personal')).json()) as SkillDetail;
    expect(d).toMatchObject({ category: 'Family', categorySource: 'manual' });
    await put(app, 'plan-meals-Personal', { category: null });
    d = (await (await app.request('/api/skills/plan-meals-Personal')).json()) as SkillDetail;
    expect(d).toMatchObject({ category: 'Health & fitness', categorySource: 'auto' });
  });

  it('validates input and unknown ids', async () => {
    const app = makeApp();
    expect((await put(app, 'plan-meals-Personal', { category: '' })).status).toBe(400);
    expect((await put(app, 'plan-meals-Personal', { category: 'x'.repeat(41) })).status).toBe(400);
    expect((await put(app, 'nope', { category: 'A' })).status).toBe(404);
  });

  it('rejects cross-origin and non-JSON writes', async () => {
    const app = makeApp();
    const evil = { ...json, origin: 'https://evil.example' };
    expect((await put(app, 'plan-meals-Personal', { category: 'A' }, evil)).status).toBe(403);
    const form = { 'content-type': 'text/plain', host: 'localhost:4173' };
    expect((await put(app, 'plan-meals-Personal', { category: 'A' }, form)).status).toBe(415);
  });
});
