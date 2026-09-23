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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok)
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

/** Pass null to clear the manual override and return to the automatic category. */
export const setCategory = (id: string, category: string | null) =>
  send<{ ok: true }>('PUT', `/api/skills/${id}/category`, { category });

export interface SkillFields {
  name: string;
  description: string;
  body: string;
}

export interface Target {
  root: string;
  label: string;
}

export interface TrashEntry {
  trashId: string;
  name: string;
}

export const fetchTargets = () => send<Target[]>('GET', '/api/targets');
export const createSkill = (fields: SkillFields, root: string) =>
  send<{ id: string }>('POST', '/api/skills', { ...fields, root });
export const updateSkill = (id: string, fields: SkillFields, etag: string) =>
  send<{ etag: string }>('PUT', `/api/skills/${id}`, { ...fields, etag });
export const duplicateSkill = (id: string, name: string, root: string) =>
  send<{ id: string }>('POST', `/api/skills/${id}/duplicate`, { name, root });
export const deleteSkill = (id: string) => send<TrashEntry>('DELETE', `/api/skills/${id}`);
export const restoreSkill = (trashId: string) =>
  send<{ id: string }>('POST', `/api/trash/${trashId}/restore`);

/** Subscribes to server-sent "changed" events; returns an unsubscribe function. */
export function onSkillsChanged(listener: () => void): () => void {
  const source = new EventSource('/api/events');
  source.addEventListener('changed', listener);
  return () => source.close();
}
