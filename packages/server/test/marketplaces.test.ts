import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  coerceDraft,
  fileMarketplaces,
  memoryMarketplaces,
  type MarketplaceDraft,
} from '../src/marketplaces.js';
import { memoryOverrides } from '../src/overrides.js';
import { createProvider } from '../src/provider.js';

let home: string;
let app: ReturnType<typeof createApp>;
const headers = { 'content-type': 'application/json', host: 'localhost:4173' };
const call = (method: string, url: string, body?: unknown) =>
  app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const skillId = async (name: string) => {
  const data = (await (await app.request('/api/skills')).json()) as {
    skills: { id: string; name: string }[];
  };
  return data.skills.find((s) => s.name === name)!.id;
};

async function draftWith(
  names: string[],
  over: Partial<MarketplaceDraft> = {},
): Promise<MarketplaceDraft> {
  const created = (await (await call('POST', '/api/marketplaces', {})).json()) as MarketplaceDraft;
  const plan = {
    name: 'my-market',
    description: 'Shared skills',
    owner: { name: 'Owner' },
    plugins: [
      {
        name: 'starter',
        description: 'Starter pack',
        version: '1.0.0',
        keywords: [],
        skills: await Promise.all(names.map(async (name) => ({ id: await skillId(name), name }))),
      },
    ],
    ...over,
  };
  return (await (
    await call('PUT', `/api/marketplaces/${created.id}`, plan)
  ).json()) as MarketplaceDraft;
}

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'skills-ui-mp-'));
  const skills = path.join(home, '.claude', 'skills');
  for (const [name, extra] of [
    ['alpha', 'clean text'],
    ['leaky', 'token = sk-abcdefghijklmnopqrstuvwx'],
  ] as const) {
    await mkdir(path.join(skills, name), { recursive: true });
    await writeFile(
      path.join(skills, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} skill\n---\n${extra}\n`,
    );
  }
  app = createApp({
    provider: createProvider(home),
    overrides: memoryOverrides(),
    trashDir: path.join(home, 'trash'),
    marketplaces: fileMarketplaces(home),
    exportsDir: path.join(home, 'exports'),
  });
});
afterEach(() => rm(home, { recursive: true, force: true }));

describe('coerceDraft', () => {
  it('coerces junk into a safe, well-typed draft', () => {
    const d = coerceDraft('mp-00000000', {
      name: 5,
      plugins: [{ skills: 'x', keywords: [1, ' a '] }, null],
      owner: [],
    });
    expect(d.name).toBe('');
    expect(d.plugins).toHaveLength(2);
    expect(d.plugins[0]).toMatchObject({ version: '1.0.0', skills: [], keywords: ['a'] });
  });
});

describe('draft storage', () => {
  it('creates, lists, updates and deletes drafts', async () => {
    const d = await draftWith(['alpha']);
    const list = (await (await app.request('/api/marketplaces')).json()) as (MarketplaceDraft & {
      issues: number;
    })[];
    expect(list.map((m) => m.name)).toEqual(['my-market']);
    expect(list[0]?.issues).toBe(0);
    expect((await call('DELETE', `/api/marketplaces/${d.id}`)).status).toBe(200);
    expect((await call('DELETE', `/api/marketplaces/${d.id}`)).status).toBe(404);
  });
  it('rejects ids that could traverse the filesystem', async () => {
    expect((await call('PUT', '/api/marketplaces/..%2Fevil', {})).status).toBe(404);
    expect(await fileMarketplaces(home).get('../../etc/passwd')).toBeUndefined();
  });
  it('memory store behaves like the file store', async () => {
    const m = memoryMarketplaces();
    await m.save({ ...coerceDraft('mp-11111111', {}) });
    expect((await m.list()).length).toBe(1);
    expect(await m.remove('mp-11111111')).toBe(true);
  });
});

describe('preview', () => {
  it('reports issues for an incomplete draft and produces no files', async () => {
    const d = await draftWith(['alpha'], { name: 'npm' });
    const p = (await (await call('POST', `/api/marketplaces/${d.id}/preview`)).json()) as {
      issues: { path: string }[];
      files: string[];
    };
    expect(p.issues.map((i) => i.path)).toContain('name');
    expect(p.files).toEqual([]);
  });
  it('lists files, manifests, and flags secrets in included skills', async () => {
    const d = await draftWith(['alpha', 'leaky']);
    const p = (await (await call('POST', `/api/marketplaces/${d.id}/preview`)).json()) as {
      issues: unknown[];
      files: string[];
      manifests: { marketplace: { name: string } };
      findings: { skill: string; severity: string; preview: string }[];
    };
    expect(p.issues).toEqual([]);
    expect(p.files).toContain('plugins/starter/skills/leaky/SKILL.md');
    expect(p.manifests.marketplace.name).toBe('my-market');
    expect(p.findings[0]).toMatchObject({ skill: 'leaky', severity: 'high' });
    expect(p.findings[0]?.preview).not.toContain('sk-abcdefghijklmnopqrstuvwx');
  });
  it('reports skills that no longer exist', async () => {
    const d = await draftWith(['alpha']);
    await rm(path.join(home, '.claude', 'skills', 'alpha'), { recursive: true });
    const p = (await (await call('POST', `/api/marketplaces/${d.id}/preview`)).json()) as {
      unresolved: { name: string }[];
    };
    expect(p.unresolved.map((u) => u.name)).toEqual(['alpha']);
  });
});

describe('export', () => {
  it('returns a zip containing the expected tree', async () => {
    const d = await draftWith(['alpha']);
    const res = await call('POST', `/api/marketplaces/${d.id}/export`, { mode: 'zip' });
    expect(res.headers.get('content-type')).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual([
      '.claude-plugin/marketplace.json',
      'README.md',
      'plugins/starter/.claude-plugin/plugin.json',
      'plugins/starter/skills/alpha/SKILL.md',
    ]);
  });
  it('writes to the exports folder, refuses to overwrite, and can git init', async () => {
    const d = await draftWith(['alpha']);
    const res = await call('POST', `/api/marketplaces/${d.id}/export`, {
      mode: 'folder',
      gitInit: true,
    });
    const out = (await res.json()) as {
      dir: string;
      git: { initialized: boolean; committed: boolean };
    };
    expect(out.dir).toBe(path.join(home, 'exports', 'my-market'));
    expect(await readdir(out.dir)).toContain('.claude-plugin');
    expect(out.git.initialized).toBe(true);
    expect(
      JSON.parse(await readFile(path.join(out.dir, '.claude-plugin', 'marketplace.json'), 'utf8'))
        .plugins[0].source,
    ).toBe('./plugins/starter');
    expect(
      (await call('POST', `/api/marketplaces/${d.id}/export`, { mode: 'folder' })).status,
    ).toBe(409);
    if (out.git.committed)
      expect(execFileSync('git', ['log', '--oneline'], { cwd: out.dir }).toString()).toContain(
        'Add my-market',
      );
  });
  it('refuses invalid plans and missing skills', async () => {
    const bad = await draftWith(['alpha'], { name: 'Bad Name' });
    expect((await call('POST', `/api/marketplaces/${bad.id}/export`, { mode: 'zip' })).status).toBe(
      400,
    );
    const d = await draftWith(['alpha']);
    await rm(path.join(home, '.claude', 'skills', 'alpha'), { recursive: true });
    expect((await call('POST', `/api/marketplaces/${d.id}/export`, { mode: 'zip' })).status).toBe(
      404,
    );
  });
});
