import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFacets, matchesQuery } from '../src/facets.js';
import { scanAll, scanSource } from '../src/scan.js';
import { discoverSources } from '../src/sources.js';

let home: string;

async function write(rel: string, content: string) {
  const p = path.join(home, rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content);
}

const skillMd = (name: string, desc = 'Does things') =>
  `---\nname: ${name}\ndescription: ${desc}\n---\nbody\n`;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'skills-ui-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('scanSource', () => {
  it('finds skills, extras and scripts, ignoring node_modules', async () => {
    await write('s/alpha/SKILL.md', skillMd('alpha'));
    await write('s/alpha/scripts/run.sh', '#!/bin/sh');
    await write('s/beta/SKILL.md', skillMd('beta'));
    await write('s/beta/node_modules/x/SKILL.md', skillMd('ignored'));
    const skills = await scanSource({
      kind: 'user',
      label: 'test',
      root: path.join(home, 's'),
      readOnly: false,
    });
    expect(skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    expect(skills.find((s) => s.name === 'alpha')?.hasScripts).toBe(true);
  });

  it('falls back to folder name and flags missing description', async () => {
    await write('s/nofm/SKILL.md', '# no frontmatter');
    const [skill] = await scanSource({
      kind: 'user',
      label: 't',
      root: path.join(home, 's'),
      readOnly: false,
    });
    expect(skill?.name).toBe('nofm');
    expect(skill?.warnings).toEqual(
      expect.arrayContaining(['missing frontmatter', 'missing description']),
    );
  });
});

describe('discoverSources', () => {
  it('finds desktop, personal and plugin sources', async () => {
    await write(
      'Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/org/acct/manifest.json',
      JSON.stringify({
        skills: [
          {
            skillId: 'skill_1',
            name: 'docx',
            creatorType: 'anthropic',
            enabled: true,
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );
    await write(
      'Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/org/acct/skills/docx/SKILL.md',
      skillMd('docx'),
    );
    await write('.claude/skills/mine/SKILL.md', skillMd('mine'));
    await write('plug/skills/p1/SKILL.md', skillMd('p1'));
    await write(
      '.claude/plugins/installed_plugins.json',
      JSON.stringify({ plugins: { 'demo@market': [{ installPath: path.join(home, 'plug') }] } }),
    );
    const sources = await discoverSources({ home, platform: 'darwin' });
    expect(sources.map((s) => s.kind)).toEqual(['desktop', 'user', 'plugin']);

    const skills = await scanAll(sources);
    expect(skills.map((s) => s.name)).toEqual(['docx', 'mine', 'p1']);
    const docx = skills.find((s) => s.name === 'docx');
    expect(docx).toMatchObject({
      creatorType: 'anthropic',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(docx?.source.readOnly).toBe(true);
    expect(skills.find((s) => s.name === 'p1')?.source.plugin).toBe('demo');
  });

  it('finds Cowork plugins synced from the account and strips generation suffixes', async () => {
    await write(
      '.claude/plugins/synced/bucket/engineering~g2/skills/debug/SKILL.md',
      skillMd('debug'),
    );
    const sources = await discoverSources({ home, platform: 'darwin' });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'plugin', plugin: 'engineering', readOnly: true });
    expect(sources[0]?.label).toBe('engineering (Cowork)');
  });

  it('returns nothing when no sources exist', async () => {
    expect(await discoverSources({ home, platform: 'darwin' })).toEqual([]);
  });
});

describe('scanAll dedupe', () => {
  it('collapses the same file reached via two sources', async () => {
    await write('s/a/SKILL.md', skillMd('a'));
    const src = {
      kind: 'custom' as const,
      label: 'x',
      root: path.join(home, 's'),
      readOnly: false,
    };
    expect(await scanAll([src, { ...src, label: 'y' }])).toHaveLength(1);
  });
});

describe('facets & search', () => {
  it('counts sources and matches multi-token queries', async () => {
    await write('s/a/SKILL.md', skillMd('meal-planner', 'Plans dinner'));
    await write('s/b/SKILL.md', skillMd('vault', 'Obsidian digest'));
    const skills = await scanAll([
      { kind: 'user', label: 'P', root: path.join(home, 's'), readOnly: false },
    ]);
    expect(buildFacets(skills).source).toEqual([{ value: 'P', count: 2 }]);
    expect(skills.filter((s) => matchesQuery(s, 'plans dinner')).map((s) => s.name)).toEqual([
      'meal-planner',
    ]);
    expect(skills.filter((s) => matchesQuery(s, 'zzz'))).toHaveLength(0);
  });
});

describe('scan root edge cases', () => {
  it('still recurses when the scan root has its own SKILL.md', async () => {
    await write('s/SKILL.md', skillMd('stray'));
    await write('s/child/SKILL.md', skillMd('child'));
    const skills = await scanSource({
      kind: 'user',
      label: 't',
      root: path.join(home, 's'),
      readOnly: false,
    });
    expect(skills.map((s) => s.name).sort()).toEqual(['child', 'stray']);
  });

  it('follows symlinked skill folders', async () => {
    await write('real/linked/SKILL.md', skillMd('linked'));
    await mkdir(path.join(home, 's'), { recursive: true });
    await symlink(path.join(home, 'real/linked'), path.join(home, 's/linked'));
    const skills = await scanSource({
      kind: 'user',
      label: 't',
      root: path.join(home, 's'),
      readOnly: false,
    });
    expect(skills.map((s) => s.name)).toEqual(['linked']);
  });
});

describe('desktop mirror dedupe', () => {
  it('drops synced copies of Desktop skills but keeps unrelated synced skills', async () => {
    const desktop = 'dt/acct/skills';
    await write('dt/acct/manifest.json', JSON.stringify({ skills: [] }));
    await write(`${desktop}/dup/SKILL.md`, skillMd('dup'));
    await write('u/synced/bucket/dup/SKILL.md', skillMd('dup'));
    await write('u/synced/bucket/only-mirror/SKILL.md', skillMd('only-mirror'));
    const skills = await scanAll([
      { kind: 'desktop', label: 'D', root: path.join(home, desktop), readOnly: true },
      { kind: 'user', label: 'U', root: path.join(home, 'u'), readOnly: false },
    ]);
    expect(skills.map((s) => `${s.source.kind}:${s.name}`)).toEqual([
      'desktop:dup',
      'user:only-mirror',
    ]);
  });
});
