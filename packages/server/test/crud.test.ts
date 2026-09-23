import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SkillDetail, SkillSummary } from '@skills-ui/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createEventBus } from '../src/events.js';
import { memoryOverrides } from '../src/overrides.js';
import { createProvider } from '../src/provider.js';

let home: string;
let personal: string;
let app: ReturnType<typeof createApp>;
let published = 0;

const headers = { 'content-type': 'application/json', host: 'localhost:4173' };
const call = (method: string, url: string, body?: unknown) =>
  app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const list = async () =>
  ((await (await app.request('/api/skills')).json()) as { skills: SkillSummary[] }).skills;
const detail = async (id: string) =>
  (await (await app.request(`/api/skills/${id}`)).json()) as SkillDetail;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'skills-ui-crud-'));
  personal = path.join(home, '.claude', 'skills');
  await mkdir(path.join(home, '.claude', 'plugins'), { recursive: true });
  await mkdir(path.join(personal, 'existing'), { recursive: true });
  await writeFile(
    path.join(personal, 'existing', 'SKILL.md'),
    '---\nname: existing\ndescription: Already here\n---\nhello\n',
  );
  const events = createEventBus();
  published = 0;
  events.subscribe(() => published++);
  app = createApp({
    provider: createProvider(home),
    overrides: memoryOverrides(),
    trashDir: path.join(home, '.skills-ui', 'trash'),
    events,
  });
});
afterEach(() => rm(home, { recursive: true, force: true }));

describe('create', () => {
  it('creates a skill in an allowed target and lists it immediately', async () => {
    const res = await call('POST', '/api/skills', {
      name: 'fresh',
      description: 'New one',
      body: '# hi',
      root: personal,
    });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect((await list()).map((s) => s.name).sort()).toEqual(['existing', 'fresh']);
    expect((await detail(id)).body).toBe('# hi\n');
    expect(published).toBe(1);
  });

  it('rejects unknown target folders, bad names and duplicates', async () => {
    expect(
      (await call('POST', '/api/skills', { name: 'x', description: 'd', root: '/etc' })).status,
    ).toBe(403);
    expect(
      (await call('POST', '/api/skills', { name: '../x', description: 'd', root: personal }))
        .status,
    ).toBe(400);
    expect(
      (await call('POST', '/api/skills', { name: 'existing', description: 'd', root: personal }))
        .status,
    ).toBe(409);
  });
});

describe('edit', () => {
  it('saves with a valid etag and rejects a stale one with 409', async () => {
    const [skill] = await list();
    const before = await detail(skill!.id);
    const ok = await call('PUT', `/api/skills/${skill!.id}`, {
      name: 'existing',
      description: 'Edited',
      body: 'changed',
      etag: before.etag,
    });
    expect(ok.status).toBe(200);
    expect(await readFile(before.file, 'utf8')).toContain('description: Edited');

    const stale = await call('PUT', `/api/skills/${skill!.id}`, {
      name: 'existing',
      description: 'Again',
      body: 'x',
      etag: before.etag,
    });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { code: string }).code).toBe('conflict');
  });

  it('returns 400 for invalid input and 404 for unknown ids', async () => {
    const [skill] = await list();
    const { etag } = await detail(skill!.id);
    expect(
      (
        await call('PUT', `/api/skills/${skill!.id}`, {
          name: 'Bad Name',
          description: 'd',
          body: '',
          etag,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call('PUT', '/api/skills/nope', { name: 'a', description: 'd', body: '', etag }))
        .status,
    ).toBe(404);
  });
});

describe('duplicate', () => {
  it('copies into an allowed target', async () => {
    const [skill] = await list();
    const res = await call('POST', `/api/skills/${skill!.id}/duplicate`, {
      name: 'existing-copy',
      root: personal,
    });
    expect(res.status).toBe(200);
    expect((await readdir(personal)).sort()).toEqual(['existing', 'existing-copy']);
  });
});

describe('delete & undo', () => {
  it('moves to trash, drops any category override, and restores on undo', async () => {
    const [skill] = await list();
    const del = await call('DELETE', `/api/skills/${skill!.id}`);
    expect(del.status).toBe(200);
    const { trashId } = (await del.json()) as { trashId: string };
    expect(await list()).toHaveLength(0);

    const undo = await call('POST', `/api/trash/${trashId}/restore`);
    expect(undo.status).toBe(200);
    expect((await list()).map((s) => s.name)).toEqual(['existing']);
    expect(
      ((await (await call('POST', `/api/trash/${trashId}/restore`)).json()) as { code: string })
        .code,
    ).toBe('not-found');
  });

  it('refuses to delete read-only skills', async () => {
    // A plugin source is read-only on every platform (Desktop paths differ per OS).
    const plugin = path.join(home, 'plug');
    await mkdir(path.join(plugin, 'skills', 'ro'), { recursive: true });
    await writeFile(
      path.join(plugin, 'skills', 'ro', 'SKILL.md'),
      '---\nname: ro\ndescription: d\n---\n',
    );
    await writeFile(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'demo@market': [{ installPath: plugin }] } }),
    );
    const ro = (await list()).find((s) => s.name === 'ro');
    expect(ro?.source.readOnly).toBe(true);
    expect((await call('DELETE', `/api/skills/${ro!.id}`)).status).toBe(403);
    expect(
      (
        await call('PUT', `/api/skills/${ro!.id}`, {
          name: 'ro',
          description: 'x',
          body: '',
          etag: 'x',
        })
      ).status,
    ).toBe(403);
  });
});
