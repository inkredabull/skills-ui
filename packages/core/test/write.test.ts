import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '../src/parse.js';
import { scanSource } from '../src/scan.js';
import {
  createSkill,
  duplicateSkill,
  fileEtag,
  restoreTrash,
  SkillWriteError,
  trashSkill,
  updateSkill,
} from '../src/write.js';
import { validateSkillInput } from '../src/validate.js';

let tmp: string;
let root: string;
let trash: string;

const rejects = async (p: Promise<unknown>, code: SkillWriteError['code']) => {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(SkillWriteError);
  expect((err as SkillWriteError).code).toBe(code);
};

const load = async (readOnly = false) =>
  scanSource({ kind: 'user', label: 'Personal', root, readOnly });

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'skills-ui-w-'));
  root = path.join(tmp, 'skills');
  trash = path.join(tmp, 'trash');
  await mkdir(root, { recursive: true });
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

describe('validateSkillInput', () => {
  it.each([
    ['Bad Name', 'd'],
    ['-lead', 'd'],
    ['double--dash', 'd'],
    ['../escape', 'd'],
    ['a'.repeat(65), 'd'],
    ['', 'd'],
    ['ok-name', ''],
    ['ok-name', 'x'.repeat(1025)],
  ])('rejects name=%j description=%j', (name, description) => {
    expect(validateSkillInput({ name, description }).length).toBeGreaterThan(0);
  });
  it('accepts a valid skill', () => {
    expect(validateSkillInput({ name: 'my-skill-2', description: 'Does a thing' })).toEqual([]);
  });
});

describe('createSkill', () => {
  it('writes a parseable SKILL.md that scans back', async () => {
    const file = await createSkill(root, {
      name: 'hello',
      description: 'Says: hello "world"',
      body: '# Hi',
    });
    const parsed = parseSkillMarkdown(await readFile(file, 'utf8'));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.frontmatter).toEqual({ name: 'hello', description: 'Says: hello "world"' });
    expect(parsed.body).toBe('# Hi\n');
    expect((await load()).map((s) => s.name)).toEqual(['hello']);
  });
  it('refuses to overwrite and rejects traversal names', async () => {
    await createSkill(root, { name: 'dup', description: 'd', body: '' });
    await rejects(createSkill(root, { name: 'dup', description: 'd', body: '' }), 'exists');
    await rejects(createSkill(root, { name: '../evil', description: 'd', body: '' }), 'invalid');
  });
});

describe('updateSkill', () => {
  const seed = async () => {
    const dir = path.join(root, 'a');
    await mkdir(dir);
    await writeFile(
      path.join(dir, 'SKILL.md'),
      '---\nname: a\ndescription: old\nlicense: MIT\ncustom: {x: 1}\n---\nold body\n',
    );
    return (await load())[0]!;
  };

  it('updates fields, preserves unknown frontmatter, returns a fresh etag', async () => {
    const skill = await seed();
    const before = fileEtag(await readFile(skill.file, 'utf8'));
    const etag = await updateSkill(
      skill,
      { name: 'a', description: 'new desc', body: 'new body' },
      before,
    );
    const text = await readFile(skill.file, 'utf8');
    expect(fileEtag(text)).toBe(etag);
    const { frontmatter, body } = parseSkillMarkdown(text);
    expect(frontmatter).toMatchObject({
      description: 'new desc',
      license: 'MIT',
      custom: { x: 1 },
    });
    expect(body).toBe('new body\n');
  });

  it('detects concurrent modification', async () => {
    const skill = await seed();
    const stale = fileEtag(await readFile(skill.file, 'utf8'));
    await writeFile(skill.file, '---\nname: a\ndescription: changed elsewhere\n---\n');
    await rejects(
      updateSkill(skill, { name: 'a', description: 'mine', body: '' }, stale),
      'conflict',
    );
    expect(await readFile(skill.file, 'utf8')).toContain('changed elsewhere');
  });

  it('refuses read-only sources and files outside the root', async () => {
    const skill = await seed();
    const etag = fileEtag(await readFile(skill.file, 'utf8'));
    const ro = { ...skill, source: { ...skill.source, readOnly: true } };
    await rejects(updateSkill(ro, { name: 'a', description: 'd', body: '' }, etag), 'forbidden');
    const outside = { ...skill, root: path.join(tmp, 'elsewhere') };
    await rejects(
      updateSkill(outside, { name: 'a', description: 'd', body: '' }, etag),
      'forbidden',
    );
  });

  it('rejects invalid input without touching the file', async () => {
    const skill = await seed();
    const before = await readFile(skill.file, 'utf8');
    await rejects(
      updateSkill(skill, { name: 'Bad Name', description: 'd', body: '' }, fileEtag(before)),
      'invalid',
    );
    expect(await readFile(skill.file, 'utf8')).toBe(before);
  });
});

describe('duplicateSkill', () => {
  it('copies extras, renames in frontmatter, and works from a read-only source', async () => {
    const src = path.join(tmp, 'ro', 'orig');
    await mkdir(path.join(src, 'scripts'), { recursive: true });
    await writeFile(path.join(src, 'SKILL.md'), '---\nname: orig\ndescription: d\n---\nbody\n');
    await writeFile(path.join(src, 'scripts', 'run.sh'), 'echo hi');
    const [skill] = await scanSource({
      kind: 'desktop',
      label: 'D',
      root: path.join(tmp, 'ro'),
      readOnly: true,
    });
    const file = await duplicateSkill(skill!, root, 'copy');
    expect(parseSkillMarkdown(await readFile(file, 'utf8')).frontmatter.name).toBe('copy');
    expect(await readdir(path.join(root, 'copy', 'scripts'))).toEqual(['run.sh']);
    await rejects(duplicateSkill(skill!, root, 'copy'), 'exists');
  });
});

describe('trash & restore', () => {
  const seed = async (name = 'gone') => {
    await createSkill(root, { name, description: 'd', body: 'b' });
    return (await load()).find((s) => s.name === name)!;
  };

  it('moves the folder to trash and restores it byte-for-byte', async () => {
    const skill = await seed();
    const original = await readFile(skill.file, 'utf8');
    const entry = await trashSkill(skill, trash);
    expect(await readdir(root)).toEqual([]);
    await restoreTrash(trash, entry.trashId);
    expect(await readFile(skill.file, 'utf8')).toBe(original);
    expect(await readdir(trash)).toEqual([]);
  });

  it('refuses to restore over something new and rejects bad ids', async () => {
    const skill = await seed();
    const entry = await trashSkill(skill, trash);
    await seed();
    await rejects(restoreTrash(trash, entry.trashId), 'exists');
    await rejects(restoreTrash(trash, '../../etc'), 'invalid');
    await rejects(restoreTrash(trash, 'missing-id'), 'not-found');
  });

  it('refuses read-only skills, and trashes a symlinked skill without deleting its target', async () => {
    const skill = await seed();
    await rejects(
      trashSkill({ ...skill, source: { ...skill.source, readOnly: true } }, trash),
      'forbidden',
    );
    const real = path.join(tmp, 'real', 'linked');
    await mkdir(real, { recursive: true });
    await writeFile(path.join(real, 'SKILL.md'), '---\nname: linked\ndescription: d\n---\n');
    await symlink(real, path.join(root, 'linked'));
    const linked = (await load()).find((s) => s.name === 'linked')!;
    await trashSkill(linked, trash);
    expect(await readFile(path.join(real, 'SKILL.md'), 'utf8')).toContain('linked');
  });
});
