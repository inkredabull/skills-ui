import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSkills, onSkillsChanged } from './api';
import { Sidebar } from './components/Sidebar';
import { AddToPluginDialog } from './components/AddToPluginDialog';
import { NewSkillDialog } from './components/NewSkillDialog';
import { SkillDrawer } from './components/SkillDrawer';
import { SkillCard, SkillRow } from './components/SkillViews';
import { Toast, type ToastData } from './components/Toast';
import { applyFilters, emptyFilters, type Filters, type SortKey } from './filters';
import { MarketplacesPage } from './pages/MarketplacesPage';
import type { SkillSummary } from './types';

type View = 'grid' | 'table';
type Page = 'skills' | 'marketplaces';

export default function App() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [view, setView] = useState<View>('grid');
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState<Page>('skills');
  const [marketId, setMarketId] = useState<string>();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<ToastData>();
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

  // Live updates: the server watches skill folders and pushes a nudge when anything changes.
  useEffect(() => onSkillsChanged(() => load()), []);

  // "/" or ⌘K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).matches('input, textarea');
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => applyFilters(skills, filters), [skills, filters]);
  const chosen = useMemo(() => skills.filter((s) => checked.has(s.id)), [skills, checked]);
  const toggle = (id: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex h-screen flex-col">
      <nav className="flex items-center gap-1 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
        <span className="mr-4 font-semibold tracking-tight">Skills UI</span>
        {(['skills', 'marketplaces'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${page === p ? 'bg-stone-200 font-medium dark:bg-stone-800' : 'hover:bg-stone-100 dark:hover:bg-stone-900'}`}
          >
            {p}
          </button>
        ))}
      </nav>
      {page === 'marketplaces' ? (
        <MarketplacesPage key={marketId} initialId={marketId} notify={setToast} />
      ) : (
        <div className="flex min-h-0 flex-1">
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
                onClick={() => setCreating(true)}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                + New skill
              </button>
              <button
                onClick={() => load(true)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
              >
                {loading ? 'Scanning…' : 'Rescan'}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {chosen.length > 0 ? (
                <div className="sticky top-0 z-[5] mb-4 flex items-center gap-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white shadow">
                  <span className="font-medium">{chosen.length} selected</span>
                  <button
                    onClick={() => setAdding(true)}
                    className="rounded bg-white/20 px-3 py-1 hover:bg-white/30"
                  >
                    Add to plugin…
                  </button>
                  <button
                    onClick={() => setChecked(new Set(visible.map((s) => s.id)))}
                    className="underline-offset-2 hover:underline"
                  >
                    Select all {visible.length} shown
                  </button>
                  <button
                    onClick={() => setChecked(new Set())}
                    className="ml-auto underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="mb-4 text-sm text-stone-500">
                  {visible.length} of {skills.length} skills · tick the boxes to bundle skills into
                  a plugin
                </p>
              )}
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
                    <SkillCard
                      key={s.id}
                      skill={s}
                      onOpen={() => setSelected(s.id)}
                      selected={checked.has(s.id)}
                      onToggle={() => toggle(s.id)}
                    />
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
                        <SkillRow
                          key={s.id}
                          skill={s}
                          onOpen={() => setSelected(s.id)}
                          selected={checked.has(s.id)}
                          onToggle={() => toggle(s.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
      {selected && (
        <SkillDrawer
          id={selected}
          onClose={() => setSelected(undefined)}
          onOpen={setSelected}
          onChanged={() => load()}
          notify={setToast}
        />
      )}
      {creating && (
        <NewSkillDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            load();
            setSelected(id);
            setToast({ message: 'Skill created' });
          }}
        />
      )}
      {adding && (
        <AddToPluginDialog
          skills={chosen}
          onClose={() => setAdding(false)}
          onAdded={(id, count, plugin) => {
            setAdding(false);
            setChecked(new Set());
            setToast({
              message: `Added ${count} skill${count > 1 ? 's' : ''} to ${plugin}`,
              action: {
                label: 'Open',
                run: () => {
                  setMarketId(id);
                  setPage('marketplaces');
                },
              },
            });
          }}
        />
      )}
      {toast && <Toast toast={toast} onDismiss={() => setToast(undefined)} />}
    </div>
  );
}
