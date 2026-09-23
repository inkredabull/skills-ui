import { categoryTone, relativeTime } from '../filters';
import type { SkillSummary } from '../types';

interface Props {
  skill: SkillSummary;
  onOpen: () => void;
  selected?: boolean;
  onToggle?: () => void;
}

function Check({
  selected,
  onToggle,
  name,
}: {
  selected?: boolean;
  onToggle?: () => void;
  name: string;
}) {
  return (
    <input
      type="checkbox"
      checked={!!selected}
      onChange={() => onToggle?.()}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Select ${name}`}
      className={`h-4 w-4 shrink-0 cursor-pointer accent-indigo-600 ${selected ? '' : 'opacity-40 hover:opacity-100'}`}
    />
  );
}

export function SourceBadge({ skill }: { skill: SkillSummary }) {
  const tone =
    skill.source.kind === 'desktop'
      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
      : skill.source.kind === 'plugin'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
  return (
    <span className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs ${tone}`}>
      {skill.source.label}
    </span>
  );
}

export function CategoryChip({ skill }: { skill: SkillSummary }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${categoryTone(skill.category)}`}
      title={skill.categorySource === 'manual' ? 'Set manually' : 'Assigned automatically'}
    >
      {skill.category}
      {skill.categorySource === 'manual' && ' ✎'}
    </span>
  );
}

export function SkillCard({ skill, onOpen, selected, onToggle }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`flex h-48 cursor-pointer flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-indigo-500 ${selected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Check selected={selected} onToggle={onToggle} name={skill.name} />
          <h3 className="truncate font-medium">{skill.name}</h3>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {skill.similar.length > 0 && (
            <span title={`Similar to ${skill.similar.map((x) => x.name).join(', ')}`}>⧉</span>
          )}
          {skill.warnings.length > 0 && (
            <span title={skill.warnings.join('\n')} className="text-amber-500">
              ⚠
            </span>
          )}
        </div>
      </div>
      <div>
        <CategoryChip skill={skill} />
      </div>
      <p className="line-clamp-2 flex-1 text-sm text-stone-600 dark:text-stone-400">
        {skill.description || <em>No description</em>}
      </p>
      <div className="flex items-center justify-between gap-2">
        <SourceBadge skill={skill} />
        <span className="shrink-0 text-xs text-stone-400">{relativeTime(skill.updatedAt)}</span>
      </div>
    </div>
  );
}

export function SkillRow({ skill, onOpen, selected, onToggle }: Props) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t border-stone-200 hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900"
    >
      <td className="whitespace-nowrap px-4 py-2 font-medium">
        <span className="flex items-center gap-2">
          <Check selected={selected} onToggle={onToggle} name={skill.name} />
          {skill.name}
        </span>
      </td>
      <td className="max-w-xl truncate px-4 py-2 text-stone-600 dark:text-stone-400">
        {skill.description}
      </td>
      <td className="px-4 py-2">
        <CategoryChip skill={skill} />
      </td>
      <td className="px-4 py-2">
        <SourceBadge skill={skill} />
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-stone-400">
        {relativeTime(skill.updatedAt)}
      </td>
    </tr>
  );
}
