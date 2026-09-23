import { describe, expect, it } from 'vitest';
import { applyFilters, categoryTone, emptyFilters, relativeTime } from './filters';
import type { SkillSummary } from './types';

const mk = (name: string, over: Partial<SkillSummary> = {}): SkillSummary => ({
  id: name,
  name,
  description: `${name} description`,
  source: { kind: 'user', label: 'Personal', readOnly: false },
  updatedAt: '2026-01-01T00:00:00Z',
  frontmatter: {},
  bytes: 1,
  lines: 1,
  extras: [],
  hasScripts: false,
  warnings: [],
  category: 'Engineering',
  categorySource: 'auto',
  confidence: 1,
  alternates: [],
  tags: [],
  similar: [],
  ...over,
});

const skills = [
  mk('b-skill', { hasScripts: true }),
  mk('a-skill', {
    source: { kind: 'desktop', label: 'Desktop', readOnly: true },
    creatorType: 'user',
  }),
];

describe('applyFilters', () => {
  it('sorts by name by default', () => {
    expect(applyFilters(skills, emptyFilters()).map((s) => s.name)).toEqual(['a-skill', 'b-skill']);
  });
  it('filters by source', () => {
    const f = { ...emptyFilters(), sources: new Set(['Desktop']) };
    expect(applyFilters(skills, f).map((s) => s.name)).toEqual(['a-skill']);
  });
  it('ANDs flags', () => {
    const f = { ...emptyFilters(), flags: new Set(['editable', 'has scripts']) };
    expect(applyFilters(skills, f).map((s) => s.name)).toEqual(['b-skill']);
  });
  it('searches tokens across name and description', () => {
    expect(applyFilters(skills, { ...emptyFilters(), query: 'b-skill descr' })).toHaveLength(1);
  });
});

describe('categories', () => {
  const cats = [mk('x', { category: 'Jobs & career', tags: ['resume'] }), mk('y')];
  it('filters by category', () => {
    const f = { ...emptyFilters(), categories: new Set(['Jobs & career']) };
    expect(applyFilters(cats, f).map((s) => s.name)).toEqual(['x']);
  });
  it('searches category and tags', () => {
    expect(applyFilters(cats, { ...emptyFilters(), query: 'resume' }).map((s) => s.name)).toEqual([
      'x',
    ]);
    expect(
      applyFilters(cats, { ...emptyFilters(), query: 'engineering' }).map((s) => s.name),
    ).toEqual(['y']);
  });
  it('gives a stable tone per category', () => {
    expect(categoryTone('Engineering')).toBe(categoryTone('Engineering'));
  });
  it('flags near-duplicates', () => {
    const dup = mk('d', { similar: [{ id: 'z', name: 'z', source: 's', score: 0.9 }] });
    const f = { ...emptyFilters(), flags: new Set(['has near-duplicates']) };
    expect(applyFilters([dup, mk('e')], f).map((s) => s.name)).toEqual(['d']);
  });
});

describe('relativeTime', () => {
  it('formats ages', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    expect(relativeTime('2026-05-31T12:00:00Z', now)).toBe('today');
    expect(relativeTime('2026-05-20T00:00:00Z', now)).toBe('12d ago');
    expect(relativeTime('2025-01-01T00:00:00Z', now)).toBe('1y ago');
    expect(relativeTime('1970-01-01T00:00:00Z', now)).toBe('');
  });
});
