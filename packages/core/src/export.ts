import { promises as fs } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';
import { buildManifests, validatePlan, type MarketplacePlan, type PlanIssue } from './packaging.js';
import { parseSkillMarkdown } from './parse.js';
import { scanForSensitive, type Finding } from './sensitive.js';
import type { Skill } from './types.js';
import { serializeSkill, SkillWriteError } from './write.js';

export interface ResolvedPlugin {
  name: string;
  skills: Skill[];
}

export interface PackageFile {
  /** POSIX-style path relative to the marketplace root. */
  path: string;
  data: Buffer;
}

export interface SensitiveFinding extends Finding {
  plugin: string;
  skill: string;
  file: string;
}

const SKIP = new Set(['.git', 'node_modules', '.DS_Store', '__pycache__']);
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_SCAN_BYTES = 1024 * 1024;

async function walk(dir: string, rel = ''): Promise<{ rel: string; abs: string }[]> {
  const out: { rel: string; abs: string }[] = [];
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT')
        throw new SkillWriteError(`Skill folder no longer exists: ${dir}`, 'not-found');
      throw err;
    });
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const stat = await fs.stat(abs); // follows symlinks
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (stat.isDirectory()) out.push(...(await walk(abs, r)));
    else if (stat.isFile()) out.push({ rel: r, abs });
  }
  return out;
}

const looksBinary = (buf: Buffer) => buf.subarray(0, 8000).includes(0);

/** Installation notes generated into the marketplace root. */
function readme(plan: MarketplacePlan): string {
  const plugins = plan.plugins
    .map(
      (p) =>
        `### ${p.name} (v${p.version})\n\n${p.description}\n\n${p.skills.map((s) => `- \`/${p.name}:${s.name}\``).join('\n')}\n\nInstall: \`/plugin install ${p.name}@${plan.name}\``,
    )
    .join('\n\n');
  return `# ${plan.name}\n\n${plan.description}\n\n## Install\n\nPush this folder to a Git repository, then in Claude Code:\n\n\`\`\`\n/plugin marketplace add <github-owner>/<repo>\n\`\`\`\n\n## Plugins\n\n${plugins}\n\nGenerated with [Skills UI](https://github.com/).\n`;
}

/**
 * Builds the complete file tree for a marketplace in memory.
 * Skill folders are copied verbatim (symlinks dereferenced); only the manifests and README are generated.
 */
export async function collectPackage(
  plan: MarketplacePlan,
  resolved: ResolvedPlugin[],
): Promise<PackageFile[]> {
  const issues = validatePlan(plan);
  if (issues.length)
    throw new SkillWriteError(issues.map((i) => `${i.path}: ${i.message}`).join('; '), 'invalid');

  const manifests = buildManifests(plan);
  const json = (v: unknown) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`);
  const files: PackageFile[] = [
    { path: '.claude-plugin/marketplace.json', data: json(manifests.marketplace) },
    { path: 'README.md', data: Buffer.from(readme(plan)) },
  ];

  let total = 0;
  for (const plugin of resolved) {
    const base = `plugins/${plugin.name}`;
    files.push({
      path: `${base}/.claude-plugin/plugin.json`,
      data: json(manifests.plugins[plugin.name]),
    });
    for (const skill of plugin.skills) {
      for (const f of await walk(skill.dir)) {
        let data: Buffer = await fs.readFile(f.abs);
        total += data.length;
        if (total > MAX_TOTAL_BYTES) {
          throw new SkillWriteError('Package is larger than 50 MB; remove large assets', 'invalid');
        }
        if (f.rel === 'SKILL.md') data = withExplicitName(data, skill.name);
        files.push({ path: `${base}/skills/${skill.name}/${f.rel}`, data });
      }
    }
  }
  return files;
}

/** Marketplace installs can lose the folder name, so make sure SKILL.md states its own name. */
function withExplicitName(data: Buffer, name: string): Buffer {
  const { frontmatter, body, warnings } = parseSkillMarkdown(data.toString('utf8'));
  if (frontmatter.name === name && warnings.length === 0) return data;
  return Buffer.from(serializeSkill({ ...frontmatter, name }, body));
}

/** Scans every text file that would be published for secrets and personal details. */
export async function scanPackage(resolved: ResolvedPlugin[]): Promise<SensitiveFinding[]> {
  const findings: SensitiveFinding[] = [];
  for (const plugin of resolved) {
    for (const skill of plugin.skills) {
      for (const f of await walk(skill.dir)) {
        const data = await fs.readFile(f.abs);
        if (data.length > MAX_SCAN_BYTES || looksBinary(data)) continue;
        for (const finding of scanForSensitive(data.toString('utf8'))) {
          findings.push({ ...finding, plugin: plugin.name, skill: skill.name, file: f.rel });
        }
      }
    }
  }
  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

export function zipPackage(files: PackageFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.path, new Uint8Array(f.data)])), {
    level: 6,
  });
}

/** Writes the tree into `outDir`, which must not exist or must be empty. */
export async function writePackage(outDir: string, files: PackageFile[]): Promise<void> {
  const existing = await fs.readdir(outDir).catch(() => undefined);
  if (existing && existing.length > 0) {
    throw new SkillWriteError(`${outDir} already exists and is not empty`, 'exists');
  }
  for (const f of files) {
    const target = path.join(outDir, ...f.path.split('/'));
    const rel = path.relative(outDir, target);
    if (rel.startsWith('..') || path.isAbsolute(rel))
      throw new SkillWriteError('Unsafe path in package', 'forbidden');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, f.data);
  }
}

export type { PlanIssue };
