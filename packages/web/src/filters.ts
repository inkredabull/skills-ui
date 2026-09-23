import type { SkillSummary } from './types';

export type SortKey = 'name' | 'updated';

export interface Filters {
  query: string;
  sources: Set<string>;
  creators: Set<string>;
  flags: Set<string>;
  sort: SortKey;
}

export const emptyFilters = (): Filters => ({
  query: '',
  sources: new Set(),
  creators: new Set(),
  flags: new Set(),
  sort: 'name',
});

export function skillFlags(s: SkillSummary): string[] {
  return [
    s.source.readOnly ? 'read-only' : 'editable',
    ...(s.hasScripts ? ['has scripts'] : []),
    ...(s.warnings.length ? ['has warnings'] : []),
  ];
}

const inSet = (set: Set<string>, values: string[]) =>
  set.size === 0 || values.some((v) => set.has(v));

export function applyFilters(skills: SkillSummary[], f: Filters): SkillSummary[] {
  const tokens = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = skills.filter((s) => {
    const hay = `${s.name} ${s.description} ${s.source.label}`.toLowerCase();
    return (
      tokens.every((t) => hay.includes(t)) &&
      inSet(f.sources, [s.source.label]) &&
      inSet(f.creators, s.creatorType ? [s.creatorType] : []) &&
      // Flags are AND-ed: "editable + has scripts" should narrow, not widen.
      [...f.flags].every((flag) => skillFlags(s).includes(flag))
    );
  });
  return out.sort((a, b) =>
    f.sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name),
  );
}

export function countBy(skills: SkillSummary[], pick: (s: SkillSummary) => string[]) {
  const m = new Map<string, number>();
  for (const s of skills) for (const v of pick(s)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return '';
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
