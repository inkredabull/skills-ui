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
