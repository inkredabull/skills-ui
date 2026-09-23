import { validateSkillInput } from '@skills-ui/core/validate';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import {
  ApiError,
  deleteSkill,
  duplicateSkill,
  fetchCategories,
  fetchSkill,
  fetchTargets,
  restoreSkill,
  setCategory,
  updateSkill,
  type CategoryCount,
  type SkillFields,
} from '../api';
import type { SkillDetail } from '../types';
import { SkillForm } from './SkillForm';
import type { ToastData } from './Toast';

interface Props {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  /** Called after the skill's metadata or files changed so the list can refresh. */
  onChanged: () => void;
  notify: (toast: ToastData) => void;
}

const AUTO = '__auto__';
const button =
  'rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800';

const toFields = (s: SkillDetail): SkillFields => ({
  name: s.name,
  description: s.description,
  body: s.body,
});
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SkillDrawer({ id, onClose, onOpen, onChanged, notify }: Props) {
  const [skill, setSkill] = useState<SkillDetail>();
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<SkillFields>();
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(undefined);
    setSkill(await fetchSkill(id));
  };

  useEffect(() => {
    setSkill(undefined);
    setDraft(undefined);
    setConflict(false);
    load().catch((e: unknown) => setError(message(e)));
    fetchCategories().then(setCategories, () => undefined);
  }, [id]);

  const dirty =
    draft !== undefined &&
    skill !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(toFields(skill));

  const close = () => {
    if (!dirty || window.confirm('Discard unsaved changes?')) onClose();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify({ message: message(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const changeCategory = (value: string) =>
    run(async () => {
      let next: string | null = value === AUTO ? null : value;
      if (value === '__new__') {
        next = window.prompt('New category name')?.trim() || null;
        if (!next) return;
      }
      await setCategory(id, next);
      await load();
      setCategories(await fetchCategories());
      onChanged();
    });

  const save = () =>
    run(async () => {
      if (!draft || !skill) return;
      try {
        await updateSkill(id, draft, skill.etag);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'conflict') {
          setConflict(true);
          return;
        }
        throw e;
      }
      await load();
      setDraft(undefined);
      setConflict(false);
      onChanged();
      notify({ message: `Saved ${skill.name}` });
    });

  const duplicate = () =>
    run(async () => {
      if (!skill) return;
      const name = window.prompt('Name for the copy', `${skill.name}-copy`)?.trim();
      if (!name) return;
      const [target] = await fetchTargets();
      if (!target) throw new Error('No editable folder is configured');
      const copy = await duplicateSkill(id, name, target.root);
      onChanged();
      notify({ message: `Copied to ${target.label}` });
      onOpen(copy.id);
    });

  const remove = () =>
    run(async () => {
      if (!skill || !window.confirm(`Move "${skill.name}" to the trash? You can undo this.`))
        return;
      const entry = await deleteSkill(id);
      onClose();
      onChanged();
      notify({
        message: `Deleted ${skill.name}`,
        action: {
          label: 'Undo',
          run: () =>
            void restoreSkill(entry.trashId).then(onChanged, (e: unknown) =>
              notify({ message: message(e), tone: 'error' }),
            ),
        },
      });
    });

  const editing = draft !== undefined;

  // Escape goes through the same unsaved-changes check as the close button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-10 flex justify-end bg-black/30" onClick={close}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl dark:bg-stone-900"
      >
        <button
          onClick={close}
          aria-label="Close"
          className="float-right text-stone-400 hover:text-stone-700"
        >
          ✕
        </button>
        {error && <p className="text-red-600">{error}</p>}
        {!skill && !error && <p className="text-stone-500">Loading…</p>}
        {skill && (
          <>
            <h2 className="text-xl font-semibold">{skill.name}</h2>

            <div className="mt-3 flex flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    onClick={() => void save()}
                    disabled={busy || !dirty || validateSkillInput(draft).length > 0}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      if (!dirty || window.confirm('Discard unsaved changes?')) {
                        setDraft(undefined);
                        setConflict(false);
                      }
                    }}
                    className={button}
                  >
                    Cancel
                  </button>
                </>
              ) : skill.source.readOnly ? (
                <button
                  onClick={() => void duplicate()}
                  disabled={busy}
                  className={button}
                  title="Read-only source: make an editable copy"
                >
                  Duplicate to Personal
                </button>
              ) : (
                <>
                  <button onClick={() => setDraft(toFields(skill))} className={button}>
                    Edit
                  </button>
                  <button onClick={() => void duplicate()} disabled={busy} className={button}>
                    Duplicate
                  </button>
                  <button
                    onClick={() => void remove()}
                    disabled={busy}
                    className={`${button} text-red-600 dark:text-red-400`}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>

            {conflict && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                This file changed on disk after you opened it, so your save was blocked.{' '}
                <button
                  className="font-medium underline"
                  onClick={() =>
                    void run(async () => {
                      await load();
                      setDraft(undefined);
                      setConflict(false);
                    })
                  }
                >
                  Discard my edits and reload
                </button>
              </div>
            )}

            {editing ? (
              <div className="mt-4">
                <SkillForm value={draft} onChange={setDraft} nameLocked />
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
                  {skill.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <select
                    value={skill.categorySource === 'manual' ? skill.category : AUTO}
                    onChange={(e) => void changeCategory(e.target.value)}
                    aria-label="Category"
                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
                  >
                    <option value={AUTO}>
                      Auto: {skill.categorySource === 'auto' ? skill.category : '…'}
                    </option>
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    <option value="__new__">New category…</option>
                  </select>
                  {skill.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
                {skill.categorySource === 'auto' &&
                  skill.confidence < 0.4 &&
                  skill.alternates.length > 0 && (
                    <p className="mt-2 text-xs text-stone-500">
                      Low confidence — could also be {skill.alternates.join(' or ')}.
                    </p>
                  )}
                {skill.similar.length > 0 && (
                  <div className="mt-4 rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
                    <p className="mb-1 font-medium">Similar skills</p>
                    <ul className="space-y-1">
                      {skill.similar.map((x) => (
                        <li key={x.id}>
                          <button
                            onClick={() => onOpen(x.id)}
                            className="text-indigo-600 hover:underline"
                          >
                            {x.name}
                          </button>{' '}
                          <span className="text-xs text-stone-500">
                            {x.source} · {Math.round(x.score * 100)}% match
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-stone-500">Source</dt>
                  <dd>
                    {skill.source.label}
                    {skill.source.readOnly && ' (read-only)'}
                  </dd>
                  {skill.creatorType && (
                    <>
                      <dt className="text-stone-500">Created by</dt>
                      <dd>{skill.creatorType}</dd>
                    </>
                  )}
                  <dt className="text-stone-500">Path</dt>
                  <dd className="break-all font-mono text-xs">{skill.file}</dd>
                  <dt className="text-stone-500">Size</dt>
                  <dd>
                    {skill.lines} lines · {(skill.bytes / 1024).toFixed(1)} KB
                  </dd>
                  {skill.extras.length > 0 && (
                    <>
                      <dt className="text-stone-500">Files</dt>
                      <dd className="font-mono text-xs">{skill.extras.join(', ')}</dd>
                    </>
                  )}
                </dl>
                {skill.warnings.length > 0 && (
                  <ul className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {skill.warnings.map((w) => (
                      <li key={w}>⚠ {w}</li>
                    ))}
                  </ul>
                )}
                <hr className="my-5 border-stone-200 dark:border-stone-800" />
                <div className="space-y-3 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1 [&_code]:dark:bg-stone-800 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-stone-100 [&_pre]:p-3 [&_pre]:dark:bg-stone-800">
                  <Markdown>{skill.body}</Markdown>
                </div>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
