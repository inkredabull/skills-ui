import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSkills } from './api';
import { Sidebar } from './components/Sidebar';
import { SkillDrawer } from './components/SkillDrawer';
import { SkillCard, SkillRow } from './components/SkillViews';
import { applyFilters, emptyFilters, type Filters, type SortKey } from './filters';
import type { SkillSummary } from './types';

type View = 'grid' | 'table';

export default function App() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [view, setView] = useState<View>('grid');
  const [selected, setSelected] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  const load = (refresh = false) => {
    setLoading(true);
    fetchSkills(refresh)
      .then((s) => {
        setSkills(s);
        setError(undefined);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  // "/" or ⌘K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).matches('input, textarea');
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setSelected(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => applyFilters(skills, filters), [skills, filters]);

  return (
    <div className="flex h-screen">
      <Sidebar skills={skills} filters={filters} onChange={setFilters} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <div className="relative min-w-64 flex-1">
            <input
              ref={searchRef}
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              placeholder="Search skills…  ( / )"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortKey })}
            className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
            aria-label="Sort"
          >
            <option value="name">Name</option>
            <option value="updated">Recently updated</option>
          </select>
          <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm dark:border-stone-700">
            {(['grid', 'table'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 capitalize ${view === v ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-stone-100 dark:bg-stone-900 dark:hover:bg-stone-800'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(true)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
          >
            {loading ? 'Scanning…' : 'Rescan'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-4 text-sm text-stone-500">
            {visible.length} of {skills.length} skills
          </p>
          {error && (
            <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}. Is the server running?
            </p>
          )}
          {!error && !loading && visible.length === 0 && (
            <p className="py-16 text-center text-stone-500">No skills match these filters.</p>
          )}
          {view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
              {visible.map((s) => (
                <SkillCard key={s.id} skill={s} onOpen={() => setSelected(s.id)} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-100 text-xs uppercase text-stone-500 dark:bg-stone-900">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">Source</th>
                    <th className="px-4 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <SkillRow key={s.id} skill={s} onOpen={() => setSelected(s.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      {selected && (
        <SkillDrawer
          id={selected}
          onClose={() => setSelected(undefined)}
          onOpen={setSelected}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}
