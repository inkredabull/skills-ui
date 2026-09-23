import { validatePlan, type PluginPlan } from '@skills-ui/core/packaging';
import { useEffect, useRef, useState } from 'react';
import {
  createMarketplace,
  deleteMarketplace,
  exportFolder,
  exportZip,
  fetchMarketplaces,
  previewMarketplace,
  saveMarketplace,
  type Draft,
  type FolderExport,
  type Preview,
} from '../api';
import type { ToastData } from '../components/Toast';

const field =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-stone-700 dark:bg-stone-900';
const btn =
  'rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800';
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  initialId?: string;
  notify: (t: ToastData) => void;
}

export function MarketplacesPage({ initialId, notify }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>();
  const [activeId, setActiveId] = useState<string | undefined>(initialId);

  const reload = async () => {
    const list = await fetchMarketplaces();
    setDrafts(list);
    setActiveId((cur) => (cur && list.some((d) => d.id === cur) ? cur : list[0]?.id));
  };
  useEffect(() => {
    reload().catch((e: unknown) => notify({ message: message(e), tone: 'error' }));
  }, []);

  const active = drafts?.find((d) => d.id === activeId);

  const create = async () => {
    const name = window.prompt('Marketplace name (lowercase-kebab-case)')?.trim();
    if (!name) return;
    try {
      const d = await createMarketplace({
        name,
        description: '',
        owner: { name: '' },
        plugins: [],
      });
      await reload();
      setActiveId(d.id);
    } catch (e) {
      notify({ message: message(e), tone: 'error' });
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-stone-200 p-4 dark:border-stone-800">
        <button
          onClick={() => void create()}
          className="mb-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + New marketplace
        </button>
        <ul className="space-y-1">
          {drafts?.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setActiveId(d.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${d.id === activeId ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'hover:bg-stone-100 dark:hover:bg-stone-900'}`}
              >
                <span className="truncate">{d.name || '(unnamed)'}</span>
                {(d.issues ?? 0) > 0 && (
                  <span title={`${d.issues} issues`} className="text-amber-500">
                    ⚠
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {drafts?.length === 0 && (
          <p className="text-sm text-stone-500">
            No marketplaces yet. Select skills on the Skills page and choose “Add to plugin”, or
            create one here.
          </p>
        )}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {active ? (
          <Editor
            key={active.id}
            initial={active}
            notify={notify}
            onSaved={() => void reload()}
            onDeleted={() => {
              setActiveId(undefined);
              void reload();
            }}
          />
        ) : (
          drafts && (
            <p className="py-16 text-center text-stone-500">Select or create a marketplace.</p>
          )
        )}
      </div>
    </div>
  );
}

function Editor({
  initial,
  notify,
  onSaved,
  onDeleted,
}: {
  initial: Draft;
  notify: (t: ToastData) => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [preview, setPreview] = useState<Preview>();
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [ack, setAck] = useState(false);
  const [gitInit, setGitInit] = useState(true);
  const [result, setResult] = useState<FolderExport>();
  const [tab, setTab] = useState<string>('marketplace.json');
  const saved = useRef(JSON.stringify(initial));

  // Debounced autosave, then refresh the preview so validation is always current.
  useEffect(() => {
    const json = JSON.stringify(draft);
    if (json === saved.current) return;
    setStatus('unsaved');
    const t = setTimeout(async () => {
      setStatus('saving');
      try {
        await saveMarketplace(draft);
        saved.current = JSON.stringify(draft);
        setStatus('saved');
        onSaved();
      } catch (e) {
        notify({ message: message(e), tone: 'error' });
        setStatus('unsaved');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [draft]);

  const refresh = () => previewMarketplace(draft.id).then(setPreview, () => undefined);
  useEffect(() => {
    if (status === 'saved') void refresh();
  }, [status, draft.id]);
  useEffect(() => setAck(false), [preview?.findings.length]);

  const setPlugin = (i: number, patch: Partial<PluginPlan>) =>
    setDraft({
      ...draft,
      plugins: draft.plugins.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    });

  const localIssues = validatePlan(draft);
  const issue = (path: string) => localIssues.find((x) => x.path === path)?.message;
  const high = preview?.findings.filter((f) => f.severity === 'high') ?? [];
  const canExport =
    status === 'saved' &&
    localIssues.length === 0 &&
    (preview?.unresolved.length ?? 1) === 0 &&
    (!preview?.findings.length || ack);

  const doExport = async (mode: 'zip' | 'folder') => {
    try {
      if (mode === 'zip') {
        await exportZip(draft);
        notify({ message: `Downloaded ${draft.name}.zip` });
      } else {
        setResult(await exportFolder(draft.id, gitInit));
      }
    } catch (e) {
      notify({ message: message(e), tone: 'error' });
    }
  };

  const manifestTabs: Record<string, unknown> = {
    'marketplace.json': preview?.manifests?.marketplace,
    ...Object.fromEntries(
      Object.entries(preview?.manifests?.plugins ?? {}).map(([k, v]) => [`${k}/plugin.json`, v]),
    ),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Marketplace</h2>
          <span className="text-xs text-stone-500">
            {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved changes'}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={issue('name')}>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={`${field} font-mono`}
            />
          </Field>
          <Field label="Description">
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={field}
            />
          </Field>
          <Field label="Owner name" error={issue('owner.name')}>
            <input
              value={draft.owner.name}
              onChange={(e) =>
                setDraft({ ...draft, owner: { ...draft.owner, name: e.target.value } })
              }
              className={field}
            />
          </Field>
          <Field label="Owner email (optional)" error={issue('owner.email')}>
            <input
              value={draft.owner.email ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, owner: { ...draft.owner, email: e.target.value } })
              }
              className={field}
            />
          </Field>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Plugins</h2>
          <button
            className={btn}
            onClick={() =>
              setDraft({
                ...draft,
                plugins: [
                  ...draft.plugins,
                  { name: '', description: '', version: '1.0.0', keywords: [], skills: [] },
                ],
              })
            }
          >
            + Add plugin
          </button>
        </div>
        {issue('plugins') && <p className="mb-2 text-sm text-amber-600">{issue('plugins')}</p>}
        <div className="space-y-4">
          {draft.plugins.map((p, i) => (
            <div key={i} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <Field label="Plugin name" error={issue(`plugins[${i}].name`)}>
                  <input
                    value={p.name}
                    onChange={(e) => setPlugin(i, { name: e.target.value })}
                    className={`${field} font-mono`}
                  />
                </Field>
                <Field label="Version" error={issue(`plugins[${i}].version`)}>
                  <input
                    value={p.version}
                    onChange={(e) => setPlugin(i, { version: e.target.value })}
                    className={field}
                  />
                </Field>
              </div>
              <Field label="Description" error={issue(`plugins[${i}].description`)}>
                <input
                  value={p.description}
                  onChange={(e) => setPlugin(i, { description: e.target.value })}
                  className={field}
                />
              </Field>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Keywords (comma separated)">
                  <input
                    defaultValue={p.keywords.join(', ')}
                    onBlur={(e) =>
                      setPlugin(i, {
                        keywords: e.target.value
                          .split(',')
                          .map((k) => k.trim())
                          .filter(Boolean),
                      })
                    }
                    className={field}
                  />
                </Field>
                <Field label="License (SPDX, optional)">
                  <input
                    value={p.license ?? ''}
                    onChange={(e) => setPlugin(i, { license: e.target.value })}
                    placeholder="MIT"
                    className={field}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-stone-500">
                  Skills ({p.skills.length})
                </p>
                {issue(`plugins[${i}].skills`) && (
                  <p className="mb-1 text-xs text-amber-600">{issue(`plugins[${i}].skills`)}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map((s) => {
                    const missing = preview?.unresolved.some(
                      (u) => u.id === s.id && u.plugin === p.name,
                    );
                    return (
                      <span
                        key={s.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${missing ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-stone-100 dark:bg-stone-800'}`}
                      >
                        {s.name}
                        {missing && ' (missing)'}
                        <button
                          aria-label={`Remove ${s.name}`}
                          onClick={() =>
                            setPlugin(i, { skills: p.skills.filter((x) => x.id !== s.id) })
                          }
                          className="text-stone-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 text-right">
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() =>
                    window.confirm(
                      `Remove plugin "${p.name || 'unnamed'}" from this marketplace? (Skills are not deleted.)`,
                    ) && setDraft({ ...draft, plugins: draft.plugins.filter((_, j) => j !== i) })
                  }
                >
                  Remove plugin
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Review before sharing</h2>
        {preview && preview.findings.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {high.length > 0
                ? `${high.length} possible secret${high.length > 1 ? 's' : ''} and `
                : ''}
              {preview.findings.length - high.length} personal detail
              {preview.findings.length - high.length === 1 ? '' : 's'} found in files that would be
              published
            </p>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto font-mono text-xs">
              {preview.findings.map((f, i) => (
                <li
                  key={i}
                  className={
                    f.severity === 'high'
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }
                >
                  {f.severity === 'high' ? '⛔' : '•'} {f.plugin}/{f.skill}/{f.file}:{f.line} —{' '}
                  {f.kind}: {f.preview}
                </li>
              ))}
            </ul>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="accent-indigo-600"
              />
              I’ve reviewed these and want to share these skills anyway
            </label>
          </div>
        )}
        {preview && preview.findings.length === 0 && localIssues.length === 0 && (
          <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">
            ✓ No secrets or personal details detected.
          </p>
        )}
        {localIssues.length > 0 && (
          <ul className="mb-4 list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">
            {localIssues.map((x, i) => (
              <li key={i}>{x.message}</li>
            ))}
          </ul>
        )}
        {preview && preview.files.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-stone-500">
                Files ({preview.files.length})
              </p>
              <ul className="max-h-72 overflow-y-auto rounded-lg bg-stone-100 p-3 font-mono text-xs dark:bg-stone-900">
                {preview.files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 flex flex-wrap gap-1">
                {Object.keys(manifestTabs).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`rounded px-2 py-0.5 text-xs ${tab === k ? 'bg-indigo-600 text-white' : 'bg-stone-100 dark:bg-stone-800'}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <pre className="max-h-72 overflow-auto rounded-lg bg-stone-100 p-3 text-xs dark:bg-stone-900">
                {JSON.stringify(manifestTabs[tab] ?? manifestTabs['marketplace.json'], null, 2)}
              </pre>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
        <h2 className="mb-3 text-lg font-semibold">Export</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void doExport('zip')}
            disabled={!canExport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Download .zip
          </button>
          <button onClick={() => void doExport('folder')} disabled={!canExport} className={btn}>
            Save to folder
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gitInit}
              onChange={(e) => setGitInit(e.target.checked)}
              className="accent-indigo-600"
            />
            Initialize a git repo
          </label>
        </div>
        {!canExport && (
          <p className="mt-2 text-xs text-stone-500">
            Fix the issues above{preview?.findings.length ? ' and confirm the review' : ''} to
            enable export.
          </p>
        )}
        {result && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
            <p>
              Saved {result.files} files to{' '}
              <code className="break-all font-mono text-xs">{result.dir}</code>
            </p>
            {result.git && (
              <p className="mt-1 text-xs">
                Git:{' '}
                {result.git.committed
                  ? 'repository created with an initial commit'
                  : result.git.initialized
                    ? `repository created, commit skipped (${result.git.message})`
                    : `not initialized (${result.git.message})`}
              </p>
            )}
            <p className="mt-2 text-xs text-stone-600 dark:text-stone-300">
              Push it to GitHub, then anyone can install with:
            </p>
            <pre className="mt-1 overflow-x-auto rounded bg-white p-2 font-mono text-xs dark:bg-stone-900">{`/plugin marketplace add <github-owner>/<repo>\n${draft.plugins.map((p) => `/plugin install ${p.name}@${draft.name}`).join('\n')}`}</pre>
          </div>
        )}
      </section>

      <div className="pb-8 text-right">
        <button
          onClick={() =>
            window.confirm(
              `Delete the marketplace "${draft.name}"? Your skills are not affected.`,
            ) &&
            void deleteMarketplace(draft.id).then(onDeleted, (e: unknown) =>
              notify({ message: message(e), tone: 'error' }),
            )
          }
          className="text-sm text-red-600 hover:underline"
        >
          Delete marketplace
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-stone-500">{label}</span>
      {children}
      {error && <span className="mt-0.5 block text-xs text-amber-600">{error}</span>}
    </label>
  );
}
