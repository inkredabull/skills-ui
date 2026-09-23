import { useEffect, useState } from 'react';
import { createMarketplace, fetchMarketplaces, saveMarketplace, type Draft } from '../api';
import type { SkillSummary } from '../types';

const NEW = '__new__';
const field =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-stone-700 dark:bg-stone-900';

interface Props {
  skills: SkillSummary[];
  onClose: () => void;
  onAdded: (marketplaceId: string, count: number, pluginName: string) => void;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function AddToPluginDialog({ skills, onClose, onAdded }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>();
  const [marketId, setMarketId] = useState(NEW);
  const [marketName, setMarketName] = useState('');
  const [pluginId, setPluginId] = useState(NEW);
  const [pluginName, setPluginName] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMarketplaces().then(
      (d) => {
        setDrafts(d);
        if (d[0]) setMarketId(d[0].id);
      },
      (e: unknown) => setError(String(e)),
    );
  }, []);

  const market = drafts?.find((d) => d.id === marketId);
  const existingPlugin = market?.plugins.find((p) => p.name === pluginId);
  const targetPlugin = existingPlugin ? existingPlugin.name : slug(pluginName);
  const ready = targetPlugin !== '' && (marketId !== NEW || slug(marketName) !== '');

  const submit = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const refs = skills.map((s) => ({ id: s.id, name: s.name }));
      const base: Draft =
        market ??
        (await createMarketplace({
          name: slug(marketName),
          description: '',
          owner: { name: '' },
          plugins: [],
        }));
      const plugins = [...base.plugins];
      const idx = plugins.findIndex((p) => p.name === targetPlugin);
      if (idx >= 0) {
        const p = plugins[idx]!;
        const have = new Set(p.skills.map((s) => s.id));
        plugins[idx] = { ...p, skills: [...p.skills, ...refs.filter((r) => !have.has(r.id))] };
      } else {
        plugins.push({
          name: targetPlugin,
          description: '',
          version: '1.0.0',
          keywords: [],
          skills: refs,
        });
      }
      const saved = await saveMarketplace({
        ...base,
        name: base.name || slug(marketName),
        plugins,
      });
      onAdded(saved.id, refs.length, targetPlugin);
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
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900"
      >
        <h2 className="text-lg font-semibold">
          Add {skills.length} skill{skills.length > 1 ? 's' : ''} to a plugin
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          A plugin bundles skills; a marketplace lists plugins so others can install them.
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Marketplace</span>
          <select
            value={marketId}
            onChange={(e) => {
              setMarketId(e.target.value);
              setPluginId(NEW);
            }}
            className={field}
          >
            {drafts?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || '(unnamed)'}
              </option>
            ))}
            <option value={NEW}>New marketplace…</option>
          </select>
        </label>
        {marketId === NEW && (
          <input
            value={marketName}
            onChange={(e) => setMarketName(e.target.value)}
            placeholder="marketplace-name"
            className={`${field} mt-2 font-mono`}
            autoFocus
          />
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Plugin</span>
          <select value={pluginId} onChange={(e) => setPluginId(e.target.value)} className={field}>
            {market?.plugins.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
            <option value={NEW}>New plugin…</option>
          </select>
        </label>
        {!existingPlugin && (
          <input
            value={pluginName}
            onChange={(e) => setPluginName(e.target.value)}
            placeholder="plugin-name"
            className={`${field} mt-2 font-mono`}
          />
        )}
        {!existingPlugin && pluginName && slug(pluginName) !== pluginName && (
          <p className="mt-1 text-xs text-stone-500">Will be saved as “{slug(pluginName)}”.</p>
        )}

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
            disabled={!ready || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
