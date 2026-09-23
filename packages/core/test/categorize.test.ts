import { describe, expect, it } from 'vitest';
import { categorizeAll } from '../src/categorize.js';
import { findSimilar } from '../src/similar.js';
import { stem, tokenize } from '../src/text.js';
import type { Skill } from '../src/types.js';

let n = 0;
const mk = (name: string, description: string): Skill => ({
  id: `id${n++}`,
  name,
  description,
  body: '',
  dir: '/x',
  file: `/x/${name}/SKILL.md`,
  root: '/x',
  source: { kind: 'user', label: 'P', readOnly: false },
  updatedAt: '2026-01-01T00:00:00Z',
  frontmatter: {},
  bytes: 1,
  lines: 1,
  extras: [],
  hasScripts: false,
  warnings: [],
});

const cat = (skills: Skill[]) => {
  const m = categorizeAll(skills);
  return Object.fromEntries(skills.map((s) => [s.name, m.get(s.id)!]));
};

describe('text', () => {
  it('stems plurals and gerunds consistently', () => {
    expect(stem('planning')).toBe(stem('plans'));
    expect(tokenize('Plans meals for the week')).toContain(stem('meals'));
  });
  it('keeps "skill" only in names', () => {
    expect(tokenize('a skill for x', {})).not.toContain(stem('skill'));
    expect(tokenize('skill-creator', { isName: true })).toContain(stem('skill'));
  });
  it('keeps short meaningful words like ai', () => {
    expect(tokenize('ai-sdk')).toContain('ai');
  });
});

describe('categorizeAll', () => {
  const skills = [
    mk('plan-meals', 'Plans breakfast, lunch and dinner and a shopping list'),
    mk('get-peloton-workouts', 'Finds a Peloton workout for recovery'),
    mk('interview-prep', 'Prepare for a job interview and resume review'),
    mk('performance-review', 'Draft a performance review for an employee'),
    mk('skill-creator', 'Create and improve skills and measure performance'),
    mk('pr-check', 'Reviews pull requests for bugs'),
    mk('zzz-mystery', 'Frobnicates the widget'),
  ];
  const c = cat(skills);

  it('assigns readable categories with no manual setup', () => {
    expect(c['plan-meals']?.category).toBe('Health & fitness');
    expect(c['get-peloton-workouts']?.category).toBe('Health & fitness');
    expect(c['interview-prep']?.category).toBe('Jobs & career');
  });
  it('uses name signals to disambiguate', () => {
    expect(c['performance-review']?.category).toBe('People & legal');
    expect(c['skill-creator']?.category).toBe('AI & agents');
  });
  it('recognises pull request review as engineering', () => {
    expect(c['pr-check']?.category).toBe('Engineering');
  });
  it('falls back to Other with zero confidence', () => {
    expect(c['zzz-mystery']).toMatchObject({ category: 'Other', confidence: 0 });
  });
  it('is deterministic', () => {
    expect(cat(skills)).toEqual(c);
  });
  it('produces distinctive, de-duplicated tags', () => {
    const tags = c['plan-meals']?.tags ?? [];
    expect(tags.length).toBeGreaterThan(0);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe('findSimilar', () => {
  it('flags near-duplicate skills and ignores unrelated ones', () => {
    const a = mk('roadmapping', 'Build a product roadmap with themes and quarterly milestones');
    const b = mk(
      'roadmap-update',
      'Update the product roadmap with themes and quarterly milestones',
    );
    const c = mk('pdf', 'Extract tables from PDF files');
    const pairs = findSimilar([a, b, c], 0.4);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]?.a, pairs[0]?.b].sort()).toEqual([a.id, b.id].sort());
  });
});

describe('tags', () => {
  it('shows readable words rather than stems', () => {
    const skills = [
      mk('ai-gateway', 'Provider failover and unified routing for models'),
      ...Array.from({ length: 5 }, (_, i) => mk(`other-${i}`, 'general things')),
    ];
    const tags = categorizeAll(skills).get(skills[0]!.id)!.tags;
    expect(tags).toContain('provider');
    expect(tags).toContain('failover');
  });
});
