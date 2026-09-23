import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { parseSkillMarkdown } from './parse.js';
import { validateSkillInput } from './validate.js';
import type { Skill } from './types.js';

export class SkillWriteError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'exists' | 'conflict' | 'forbidden' | 'not-found',
  ) {
    super(message);
  }
}

export interface SkillInput {
  name: string;
  description: string;
  body: string;
}

function assertValid(input: Pick<SkillInput, 'name' | 'description'>): void {
  const errors = validateSkillInput(input);
  if (errors.length) throw new SkillWriteError(errors.join('; '), 'invalid');
}

/** Content hash used for optimistic concurrency: a save fails if the file changed underneath us. */
export function fileEtag(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

export function serializeSkill(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n\n${body.replace(/^\n+/, '').replace(/\s*$/, '\n')}`;
}

/** Throws unless `target` is lexically inside `root` (symlinks inside root are followed on purpose). */
export function assertInside(root: string, target: string): void {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new SkillWriteError('Path is outside the skill source', 'forbidden');
  }
}

function assertWritable(skill: Skill): void {
  if (skill.source.readOnly) {
    throw new SkillWriteError(`${skill.source.label} is read-only`, 'forbidden');
  }
  assertInside(skill.root, skill.file);
}

const exists = (p: string) =>
  fs.lstat(p).then(
    () => true,
    () => false,
  );

export async function createSkill(root: string, input: SkillInput): Promise<string> {
  assertValid(input);
  const dir = path.join(root, input.name);
  assertInside(root, dir);
  if (await exists(dir))
    throw new SkillWriteError(`A skill named "${input.name}" already exists here`, 'exists');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  await fs.writeFile(
    file,
    serializeSkill({ name: input.name, description: input.description }, input.body),
    {
      flag: 'wx',
    },
  );
  return file;
}

/** Rewrites name/description/body while preserving every other frontmatter key. Returns the new etag. */
export async function updateSkill(
  skill: Skill,
  input: SkillInput,
  expectedEtag: string,
): Promise<string> {
  assertWritable(skill);
  assertValid(input);
  const current = await fs.readFile(skill.file, 'utf8').catch(() => {
    throw new SkillWriteError('Skill no longer exists', 'not-found');
  });
  if (fileEtag(current) !== expectedEtag) {
    throw new SkillWriteError('The file changed on disk since you opened it', 'conflict');
  }
  const { frontmatter } = parseSkillMarkdown(current);
  const next = serializeSkill(
    { ...frontmatter, name: input.name, description: input.description },
    input.body,
  );
  const tmp = `${skill.file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, next);
  await fs.rename(tmp, skill.file);
  return fileEtag(next);
}

/** Copies a skill folder (dereferencing symlinks) into `root` under a new name. Works for read-only sources. */
export async function duplicateSkill(skill: Skill, root: string, newName: string): Promise<string> {
  assertValid({ name: newName, description: skill.description || 'x' });
  const dir = path.join(root, newName);
  assertInside(root, dir);
  if (await exists(dir))
    throw new SkillWriteError(`A skill named "${newName}" already exists here`, 'exists');
  await fs.cp(skill.dir, dir, { recursive: true, dereference: true });
  const file = path.join(dir, 'SKILL.md');
  const { frontmatter, body } = parseSkillMarkdown(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, serializeSkill({ ...frontmatter, name: newName }, body));
  return file;
}

export interface TrashEntry {
  trashId: string;
  name: string;
  originalDir: string;
  deletedAt: string;
}

/** Moves the skill folder into the trash directory; restorable until the trash is emptied. */
export async function trashSkill(skill: Skill, trashDir: string): Promise<TrashEntry> {
  assertWritable(skill);
  const trashId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const holder = path.join(trashDir, trashId);
  await fs.mkdir(holder, { recursive: true });
  const entry: TrashEntry = {
    trashId,
    name: skill.name,
    originalDir: skill.dir,
    deletedAt: new Date().toISOString(),
  };
  await moveDir(skill.dir, path.join(holder, 'skill'));
  await fs.writeFile(path.join(holder, 'meta.json'), JSON.stringify(entry, null, 2));
  return entry;
}

export async function restoreTrash(trashDir: string, trashId: string): Promise<string> {
  if (!/^[\w-]+$/.test(trashId)) throw new SkillWriteError('Invalid trash id', 'invalid');
  const holder = path.join(trashDir, trashId);
  let entry: TrashEntry;
  try {
    entry = JSON.parse(await fs.readFile(path.join(holder, 'meta.json'), 'utf8')) as TrashEntry;
  } catch {
    throw new SkillWriteError('Nothing to restore', 'not-found');
  }
  if (await exists(entry.originalDir)) {
    throw new SkillWriteError('Something already exists at the original location', 'exists');
  }
  await fs.mkdir(path.dirname(entry.originalDir), { recursive: true });
  await moveDir(path.join(holder, 'skill'), entry.originalDir);
  await fs.rm(holder, { recursive: true, force: true });
  return entry.originalDir;
}

async function moveDir(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.cp(from, to, { recursive: true, verbatimSymlinks: true });
    await fs.rm(from, { recursive: true, force: true });
  }
}
