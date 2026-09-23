import type { Skill } from './types.js';

export interface FacetCount {
  value: string;
  count: number;
}

export interface Facets {
  source: FacetCount[];
  creator: FacetCount[];
  flags: FacetCount[];
}

function tally(values: string[]): FacetCount[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export function buildFacets(skills: Skill[]): Facets {
  return {
    source: tally(skills.map((s) => s.source.label)),
    creator: tally(skills.flatMap((s) => (s.creatorType ? [s.creatorType] : []))),
    flags: tally(
      skills.flatMap((s) => [
        ...(s.hasScripts ? ['has scripts'] : []),
        ...(s.warnings.length ? ['has warnings'] : []),
        ...(s.source.readOnly ? ['read-only'] : ['editable']),
      ]),
    ),
  };
}

/** Case-insensitive token search across name, description and source. */
export function matchesQuery(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${skill.name} ${skill.description} ${skill.source.label}`.toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}
