import type { SkillSummary } from './types';

export type SortKey = 'name' | 'updated';

export interface Filters {
  query: string;
  categories: Set<string>;
  sources: Set<string>;
  creators: Set<string>;
  flags: Set<string>;
  sort: SortKey;
}

export const emptyFilters = (): Filters => ({
  query: '',
  categories: new Set(),
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
    ...(s.similar.length ? ['has near-duplicates'] : []),
  ];
}

const inSet = (set: Set<string>, values: string[]) =>
  set.size === 0 || values.some((v) => set.has(v));

export function applyFilters(skills: SkillSummary[], f: Filters): SkillSummary[] {
  const tokens = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = skills.filter((s) => {
    const hay =
      `${s.name} ${s.description} ${s.source.label} ${s.category} ${s.tags.join(' ')}`.toLowerCase();
    return (
      tokens.every((t) => hay.includes(t)) &&
      inSet(f.categories, [s.category]) &&
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
  const t = Date.parse(iso);
  // Timestamps before 2000 are placeholders (epoch mtimes), not real edit times.
  if (Number.isNaN(t) || new Date(t).getFullYear() < 2000) return '';
  const days = Math.floor((now - t) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const CATEGORY_TONES = [
  'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300',
  'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300',
];

/** Stable color per category name so chips are recognizable across views. */
export function categoryTone(name: string): string {
  if (name === 'Other') return 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_TONES[h % CATEGORY_TONES.length]!;
}
