import { DESCRIPTION_MAX, NAME_MAX, validateSkillInput } from '@skills-ui/core/validate';
import type { SkillFields } from '../api';

interface Props {
  value: SkillFields;
  onChange: (next: SkillFields) => void;
  /** Lock the name when editing so the folder and frontmatter stay aligned. */
  nameLocked?: boolean;
}

const input =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900';

export function SkillForm({ value, onChange, nameLocked }: Props) {
  const errors = validateSkillInput(value);
  const set = (patch: Partial<SkillFields>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 flex justify-between font-medium">
          Name
          <span className="font-normal text-stone-400">
            {value.name.length}/{NAME_MAX}
          </span>
        </span>
        <input
          value={value.name}
          disabled={nameLocked}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="my-skill"
          className={`${input} font-mono`}
          autoFocus={!nameLocked}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 flex justify-between font-medium">
          Description
          <span
            className={
              value.description.length > DESCRIPTION_MAX
                ? 'text-red-600'
                : 'font-normal text-stone-400'
            }
          >
            {value.description.length}/{DESCRIPTION_MAX}
          </span>
        </span>
        <textarea
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={4}
          placeholder="What it does, and when Claude should use it."
          className={input}
        />
        <span className="mt-1 block text-xs text-stone-500">
          Claude decides when to use a skill from this text, so include the situations that should
          trigger it.
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Instructions (Markdown)</span>
        <textarea
          value={value.body}
          onChange={(e) => set({ body: e.target.value })}
          rows={16}
          spellCheck={false}
          className={`${input} font-mono text-xs leading-relaxed`}
        />
      </label>
      {errors.length > 0 && (value.name || value.description) && (
        <ul className="text-xs text-red-600">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
