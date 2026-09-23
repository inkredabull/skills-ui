import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { fetchSkill } from '../api';
import type { SkillDetail } from '../types';

export function SkillDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [skill, setSkill] = useState<SkillDetail>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSkill(undefined);
    fetchSkill(id).then(setSkill, (e: unknown) => setError(String(e)));
  }, [id]);

  return (
    <div className="fixed inset-0 z-10 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl dark:bg-stone-900"
      >
        <button onClick={onClose} className="float-right text-stone-400 hover:text-stone-700">
          ✕
        </button>
        {error && <p className="text-red-600">{error}</p>}
        {!skill && !error && <p className="text-stone-500">Loading…</p>}
        {skill && (
          <>
            <h2 className="text-xl font-semibold">{skill.name}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{skill.description}</p>
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
      </aside>
    </div>
  );
}
