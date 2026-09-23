import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectPackage, scanPackage, writePackage, zipPackage } from '../src/export.js';
import { buildManifests, validatePlan, type MarketplacePlan } from '../src/packaging.js';
import { parseSkillMarkdown } from '../src/parse.js';
import { scanSource } from '../src/scan.js';
import { scanForSensitive } from '../src/sensitive.js';
import type { Skill } from '../src/types.js';

const plan = (over: Partial<MarketplacePlan> = {}): MarketplacePlan => ({
  name: 'my-market',
  description: 'My skills',
  owner: { name: 'Someone', email: 'me@company.io' },
  plugins: [
    {
      name: 'starter',
      description: 'Starter pack',
      version: '1.0.0',
      keywords: ['demo'],
      skills: [{ id: 'a', name: 'alpha' }],
    },
  ],
  ...over,
});

describe('validatePlan', () => {
  const messages = (p: MarketplacePlan) => validatePlan(p).map((i) => `${i.path}: ${i.message}`);

  it('accepts a good plan', () => {
    expect(validatePlan(plan())).toEqual([]);
  });
  it.each(['Claude-Plugins-Official', 'agent-skills', 'npm', 'GitHub'])(
    'rejects reserved marketplace name %s',
    (name) => {
      expect(messages(plan({ name })).join()).toMatch(/reserved|kebab/);
    },
  );
  it('rejects non-kebab names, bad versions, missing fields', () => {
    const p = plan();
    p.name = 'My Market';
    p.owner = { name: ' ', email: 'nope', url: 'ftp://x' };
    p.plugins[0]!.version = '1.0';
    p.plugins[0]!.description = '';
    p.plugins[0]!.skills = [];
    const m = messages(p).join('\n');
    for (const expected of [
      'name:',
      'owner.name',
      'owner.email',
      'owner.url',
      'version',
      'description',
      'skills',
    ]) {
      expect(m).toContain(expected);
    }
  });
  it('rejects duplicate plugin names and colliding skill names', () => {
    const p = plan();
    p.plugins.push({
      ...p.plugins[0]!,
      skills: [
        { id: '1', name: 'x' },
        { id: '2', name: 'x' },
      ],
    });
    const m = messages(p).join('\n');
    expect(m).toMatch(/Duplicate plugin name/);
    expect(m).toMatch(/Two skills are named "x"/);
  });
  it('requires at least one plugin', () => {
    expect(messages(plan({ plugins: [] })).join()).toMatch(/at least one plugin/);
  });
});

describe('buildManifests', () => {
  it('matches the documented marketplace and plugin schemas', () => {
    const { marketplace, plugins } = buildManifests(plan());
    expect(marketplace).toEqual({
      name: 'my-market',
      description: 'My skills',
      owner: { name: 'Someone', email: 'me@company.io' },
      plugins: [
        {
          name: 'starter',
          source: './plugins/starter',
          description: 'Starter pack',
          version: '1.0.0',
          author: { name: 'Someone', email: 'me@company.io' },
          keywords: ['demo'],
        },
      ],
    });
    expect(plugins.starter).toEqual({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter pack',
      author: { name: 'Someone', email: 'me@company.io' },
      keywords: ['demo'],
    });
  });
  it('omits empty optional fields', () => {
    const p = plan({ owner: { name: 'Solo' } });
    p.plugins[0]!.keywords = [];
    const { marketplace } = buildManifests(p);
    expect(JSON.stringify(marketplace)).not.toMatch(/email|keywords|license|category/);
  });
});

describe('scanForSensitive', () => {
  it.each([
    ['key = sk-abcdefghijklmnopqrstuvwx', 'API key (sk-…)', 'high'],
    ['ghp_' + 'a'.repeat(36), 'GitHub token', 'high'],
    ['AKIAABCDEFGHIJKLMNOP', 'AWS access key', 'high'],
    ['-----BEGIN RSA PRIVATE KEY-----', 'Private key', 'high'],
    ['password: "hunter2hunter2hunter2"', 'Hard-coded credential', 'high'],
    ['contact anthony@bluxomelabs.com', 'Email address', 'low'],
    ['cd /Users/inkredabull/Code', 'Personal home path', 'low'],
  ])('flags %s', (text, kind, severity) => {
    const [f] = scanForSensitive(text);
    expect(f).toMatchObject({ kind, severity, line: 1 });
  });
  it('never echoes full secrets', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwx';
    expect(scanForSensitive(`k=${secret}`)[0]?.preview).not.toContain(secret);
  });
  it('ignores placeholders and clean text', () => {
    expect(scanForSensitive('mail user@example.com or noreply@github.com\nplain text')).toEqual([]);
  });
  it('reports the right line', () => {
    expect(scanForSensitive('ok\nok\nsk-abcdefghijklmnopqrstuvwx')[0]?.line).toBe(3);
  });
});

describe('collectPackage / writePackage / zipPackage', () => {
  let tmp: string;
  let skills: Skill[];
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'skills-ui-pkg-'));
    const root = path.join(tmp, 'src');
    await mkdir(path.join(root, 'alpha', 'scripts'), { recursive: true });
    await mkdir(path.join(root, 'alpha', 'node_modules', 'x'), { recursive: true });
    await writeFile(
      path.join(root, 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: Alpha skill\n---\nbody\n',
    );
    await writeFile(path.join(root, 'alpha', 'scripts', 'run.sh'), 'echo "/Users/bob/private"');
    await writeFile(path.join(root, 'alpha', 'node_modules', 'x', 'i.js'), 'junk');
    // No frontmatter name: folder name is the fallback and must be made explicit.
    await mkdir(path.join(root, 'nofm'));
    await writeFile(path.join(root, 'nofm', 'SKILL.md'), '# just markdown');
    // A symlinked skill folder must be dereferenced into real files.
    await mkdir(path.join(tmp, 'real', 'linked'), { recursive: true });
    await writeFile(
      path.join(tmp, 'real', 'linked', 'SKILL.md'),
      '---\nname: linked\ndescription: L\n---\n',
    );
    await symlink(path.join(tmp, 'real', 'linked'), path.join(root, 'linked'));
    skills = await scanSource({ kind: 'user', label: 'P', root, readOnly: false });
  });
  afterEach(() => rm(tmp, { recursive: true, force: true }));

  const pick = (...names: string[]) => skills.filter((s) => names.includes(s.name));
  const mk = (names: string[]) => {
    const p = plan();
    p.plugins[0]!.skills = names.map((n) => ({ id: n, name: n }));
    return { p, resolved: [{ name: 'starter', skills: pick(...names) }] };
  };

  it('lays files out as the docs describe and excludes junk', async () => {
    const { p, resolved } = mk(['alpha']);
    const files = (await collectPackage(p, resolved)).map((f) => f.path).sort();
    expect(files).toEqual([
      '.claude-plugin/marketplace.json',
      'README.md',
      'plugins/starter/.claude-plugin/plugin.json',
      'plugins/starter/skills/alpha/SKILL.md',
      'plugins/starter/skills/alpha/scripts/run.sh',
    ]);
  });

  it('makes the skill name explicit and dereferences symlinks', async () => {
    const { p, resolved } = mk(['nofm', 'linked']);
    const files = await collectPackage(p, resolved);
    const nofm = files.find((f) => f.path.endsWith('skills/nofm/SKILL.md'))!;
    expect(parseSkillMarkdown(nofm.data.toString()).frontmatter.name).toBe('nofm');
    expect(files.some((f) => f.path.endsWith('skills/linked/SKILL.md'))).toBe(true);
  });

  it('leaves well-formed SKILL.md bytes untouched', async () => {
    const { p, resolved } = mk(['alpha']);
    const md = (await collectPackage(p, resolved)).find((f) => f.path.endsWith('alpha/SKILL.md'))!;
    expect(md.data.toString()).toBe('---\nname: alpha\ndescription: Alpha skill\n---\nbody\n');
  });

  it('refuses invalid plans', async () => {
    const { p, resolved } = mk(['alpha']);
    p.name = 'npm';
    await expect(collectPackage(p, resolved)).rejects.toThrow(/reserved/);
  });

  it('writes to an empty folder and refuses a non-empty one', async () => {
    const { p, resolved } = mk(['alpha']);
    const files = await collectPackage(p, resolved);
    const out = path.join(tmp, 'out');
    await writePackage(out, files);
    expect(
      JSON.parse(await readFile(path.join(out, '.claude-plugin/marketplace.json'), 'utf8')).name,
    ).toBe('my-market');
    await expect(writePackage(out, files)).rejects.toThrow(/not empty/);
  });

  it('round-trips through a zip', async () => {
    const { p, resolved } = mk(['alpha']);
    const zip = zipPackage(await collectPackage(p, resolved));
    const entries = unzipSync(zip);
    expect(Object.keys(entries)).toContain('plugins/starter/skills/alpha/SKILL.md');
    expect(
      Buffer.from(entries['plugins/starter/skills/alpha/scripts/run.sh']!).toString(),
    ).toContain('/Users/bob');
  });

  it('scans published files, high severity first, with file locations', async () => {
    await writeFile(
      path.join(tmp, 'src', 'alpha', 'notes.md'),
      'token = sk-abcdefghijklmnopqrstuvwx',
    );
    skills = await scanSource({
      kind: 'user',
      label: 'P',
      root: path.join(tmp, 'src'),
      readOnly: false,
    });
    const findings = await scanPackage([{ name: 'starter', skills: pick('alpha') }]);
    expect(findings[0]).toMatchObject({ severity: 'high', file: 'notes.md', skill: 'alpha' });
    expect(
      findings.some((f) => f.kind === 'Personal home path' && f.file === 'scripts/run.sh'),
    ).toBe(true);
    expect(findings.every((f) => !f.file.includes('node_modules'))).toBe(true);
  });
});
