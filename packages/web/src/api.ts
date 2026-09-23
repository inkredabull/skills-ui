import type { SkillDetail, SkillSummary } from './types';

export async function fetchSkills(refresh = false): Promise<SkillSummary[]> {
  const res = await fetch(`/api/skills${refresh ? '?refresh=1' : ''}`);
  if (!res.ok) throw new Error(`Failed to load skills (${res.status})`);
  return ((await res.json()) as { skills: SkillSummary[] }).skills;
}

export async function fetchSkill(id: string): Promise<SkillDetail> {
  const res = await fetch(`/api/skills/${id}`);
  if (!res.ok) throw new Error(`Failed to load skill (${res.status})`);
  return (await res.json()) as SkillDetail;
}

export interface CategoryCount {
  name: string;
  count: number;
}

export async function fetchCategories(): Promise<CategoryCount[]> {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error(`Failed to load categories (${res.status})`);
  return (await res.json()) as CategoryCount[];
}

/** Pass null to clear the manual override and return to the automatic category. */
export async function setCategory(id: string, category: string | null): Promise<void> {
  const res = await fetch(`/api/skills/${id}/category`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  if (!res.ok) throw new Error(`Failed to save category (${res.status})`);
}
