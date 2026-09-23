import { countBy, skillFlags, type Filters } from '../filters';
import type { SkillSummary } from '../types';

interface Props {
  skills: SkillSummary[];
  filters: Filters;
  onChange: (f: Filters) => void;
}

type SetKey = 'sources' | 'creators' | 'flags';

export function Sidebar({ skills, filters, onChange }: Props) {
  const toggle = (key: SetKey, value: string) => {
    const next = new Set(filters[key]);
    if (!next.delete(value)) next.add(value);
    onChange({ ...filters, [key]: next });
  };

  const groups: { title: string; key: SetKey; items: { value: string; count: number }[] }[] = [
    { title: 'Source', key: 'sources', items: countBy(skills, (s) => [s.source.label]) },
    {
      title: 'Created by',
      key: 'creators',
      items: countBy(skills, (s) => (s.creatorType ? [s.creatorType] : [])),
    },
    { title: 'Properties', key: 'flags', items: countBy(skills, skillFlags) },
  ];
  const active = filters.sources.size + filters.creators.size + filters.flags.size;

  return (
    <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-stone-200 p-5 md:block dark:border-stone-800">
      <h1 className="mb-6 text-lg font-semibold tracking-tight">Skills</h1>
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.key} className="mb-6">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                {g.title}
              </h2>
              <ul className="space-y-1">
                {g.items.map((i) => (
                  <li key={i.value}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-900">
                      <input
                        type="checkbox"
                        checked={filters[g.key].has(i.value)}
                        onChange={() => toggle(g.key, i.value)}
                        className="accent-indigo-600"
                      />
                      <span className="min-w-0 flex-1 truncate" title={i.value}>
                        {i.value}
                      </span>
                      <span className="text-xs text-stone-400">{i.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
      {active > 0 && (
        <button
          onClick={() =>
            onChange({ ...filters, sources: new Set(), creators: new Set(), flags: new Set() })
          }
          className="text-sm text-indigo-600 hover:underline"
        >
          Clear {active} filter{active > 1 ? 's' : ''}
        </button>
      )}
    </aside>
  );
}
