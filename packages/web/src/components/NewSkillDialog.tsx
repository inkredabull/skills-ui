import { validateSkillInput } from '@skills-ui/core/validate';
import { useEffect, useState } from 'react';
import { createSkill, fetchTargets, type SkillFields, type Target } from '../api';
import { SkillForm } from './SkillForm';

const TEMPLATE = `# Skill title

## When to use
Describe the situations where this skill applies.

## Steps
1. …
`;

export function NewSkillDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [fields, setFields] = useState<SkillFields>({ name: '', description: '', body: TEMPLATE });
  const [targets, setTargets] = useState<Target[]>([]);
  const [root, setRoot] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTargets().then(
      (t) => {
        setTargets(t);
        setRoot(t[0]?.root ?? '');
      },
      (e: unknown) => setError(String(e)),
    );
  }, []);

  const valid = validateSkillInput(fields).length === 0 && root !== '';

  const submit = async () => {
    setSaving(true);
    setError(undefined);
    try {
      onCreated((await createSkill(fields, root)).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900"
      >
        <h2 className="mb-4 text-lg font-semibold">New skill</h2>
        {targets.length > 1 && (
          <label className="mb-4 block text-sm">
            <span className="mb-1 block font-medium">Save to</span>
            <select
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
            >
              {targets.map((t) => (
                <option key={t.root} value={t.root}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <SkillForm value={fields} onChange={setFields} />
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!valid || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
