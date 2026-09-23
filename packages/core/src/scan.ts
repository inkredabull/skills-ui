import { createHash } from 'node:crypto';
import { promises as fs, type Dirent, type Stats } from 'node:fs';
import path from 'node:path';
import { parseSkillMarkdown } from './parse.js';
import type { DesktopManifestEntry, Skill, SkillSource } from './types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__pycache__']);
const MAX_DEPTH = 4;

export function skillId(file: string): string {
  return createHash('sha1').update(file).digest('hex').slice(0, 12);
}

async function isDir(p: string, e: Dirent): Promise<boolean> {
  if (e.isDirectory()) return true;
  if (!e.isSymbolicLink()) return false;
  return fs.stat(p).then(
    (st) => st.isDirectory(),
    () => false,
  );
}

async function findSkillFiles(root: string, depth = 0): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const e of entries) {
    if (e.isFile() && e.name === 'SKILL.md') found.push(path.join(root, e.name));
  }
  // A skill folder does not contain nested skills, but the scan root may hold a stray SKILL.md.
  if ((found.length > 0 && depth > 0) || depth >= MAX_DEPTH) return found;
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    if (await isDir(path.join(root, e.name), e)) {
      found.push(...(await findSkillFiles(path.join(root, e.name), depth + 1)));
    }
  }
  return found;
}

async function readManifest(root: string): Promise<Map<string, DesktopManifestEntry>> {
  const map = new Map<string, DesktopManifestEntry>();
  try {
    const raw = await fs.readFile(path.join(path.dirname(root), 'manifest.json'), 'utf8');
    const data = JSON.parse(raw) as { skills?: DesktopManifestEntry[] };
    for (const s of data.skills ?? []) map.set(s.name, s);
  } catch {
    /* no manifest: not a Desktop store */
  }
  return map;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/** Synced plugin files can carry an epoch mtime; fall back to birthtime, then mtime as-is. */
function bestTimestamp(stat: Stats): Date {
  const sane = (d: Date) => d.getFullYear() >= 2000;
  return [stat.mtime, stat.birthtime].find(sane) ?? stat.mtime;
}

export async function readSkill(
  file: string,
  source: SkillSource,
  manifest?: Map<string, DesktopManifestEntry>,
): Promise<Skill> {
  const [text, stat, siblings] = await Promise.all([
    fs.readFile(file, 'utf8'),
    fs.stat(file),
    fs.readdir(path.dirname(file)),
  ]);
  const { frontmatter, body, warnings } = parseSkillMarkdown(text);
  const dir = path.dirname(file);
  const name = asString(frontmatter.name) || path.basename(dir);
  const entry = manifest?.get(name);
  const extras = siblings.filter((s) => s !== 'SKILL.md' && !s.startsWith('.'));
  const description = asString(frontmatter.description) || asString(entry?.description);
  if (!description) warnings.push('missing description');
  return {
    id: skillId(file),
    name,
    description,
    body,
    dir,
    file,
    root: source.root,
    source: {
      kind: source.kind,
      label: source.label,
      readOnly: source.readOnly,
      plugin: source.plugin,
    },
    creatorType: entry?.creatorType,
    enabled: entry?.enabled,
    updatedAt: entry?.updatedAt ?? bestTimestamp(stat).toISOString(),
    license: asString(frontmatter.license) || undefined,
    frontmatter,
    bytes: stat.size,
    lines: text.split('\n').length,
    extras,
    hasScripts: extras.some((x) => /^(scripts?|bin)$/i.test(x)),
    warnings,
  };
}

export async function scanSource(source: SkillSource): Promise<Skill[]> {
  const files = await findSkillFiles(source.root);
  const manifest = source.kind === 'desktop' ? await readManifest(source.root) : undefined;
  const skills = await Promise.all(
    files.map((f) => readSkill(f, source, manifest).catch(() => undefined)),
  );
  return skills.filter((s): s is Skill => s !== undefined);
}

/** Claude Code mirrors Desktop skills into ~/.claude/skills/synced/<bucket>/. */
const isDesktopMirror = (skill: Skill) =>
  skill.source.kind === 'user' && skill.file.split(path.sep).includes('synced');

/**
 * Scans all sources, de-duplicating skills that resolve to the same real file and dropping
 * ~/.claude/skills/synced copies of skills that the Desktop store already provides.
 */
export async function scanAll(sources: SkillSource[]): Promise<Skill[]> {
  const results = await Promise.all(sources.map(scanSource));
  const all = results.flat();
  const desktopNames = new Set(all.filter((s) => s.source.kind === 'desktop').map((s) => s.name));
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const skill of all) {
    if (isDesktopMirror(skill) && desktopNames.has(skill.name)) continue;
    const real = await fs.realpath(skill.file).catch(() => skill.file);
    if (seen.has(real)) continue;
    seen.add(real);
    out.push(skill);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
