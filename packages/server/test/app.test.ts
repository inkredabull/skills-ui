import type { Skill } from '@skills-ui/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const skill = (name: string, description: string): Skill => ({
  id: name,
  name,
  description,
  body: 'secret body',
  dir: `/x/${name}`,
  file: `/x/${name}/SKILL.md`,
  source: { kind: 'user', label: 'Personal', readOnly: false },
  updatedAt: '2026-01-01T00:00:00Z',
  frontmatter: {},
  bytes: 1,
  lines: 1,
  extras: [],
  hasScripts: false,
  warnings: [],
});

const app = createApp({
  load: async () => [skill('alpha', 'plans meals'), skill('beta', 'ships code')],
});

describe('api', () => {
  it('lists skills without bodies or filesystem paths and filters by query', async () => {
    const res = await app.request('/api/skills?q=meals');
    const data = (await res.json()) as { total: number; skills: Record<string, unknown>[] };
    expect(data.total).toBe(1);
    expect(data.skills[0]).not.toHaveProperty('body');
    expect(data.skills[0]).not.toHaveProperty('file');
  });

  it('returns detail with body, 404 for unknown ids', async () => {
    expect(((await (await app.request('/api/skills/alpha')).json()) as Skill).body).toBe(
      'secret body',
    );
    expect((await app.request('/api/skills/nope')).status).toBe(404);
  });

  it('returns facets', async () => {
    const f = (await (await app.request('/api/facets')).json()) as { source: { count: number }[] };
    expect(f.source[0]?.count).toBe(2);
  });
});
