import { parse as parseYaml } from 'yaml';

export interface ParsedSkillFile {
  frontmatter: Record<string, unknown>;
  body: string;
  warnings: string[];
}

const FENCE = /^---\s*$/;

/** Splits a SKILL.md into YAML frontmatter and markdown body. Never throws. */
export function parseSkillMarkdown(text: string): ParsedSkillFile {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  if (!lines[0] || !FENCE.test(lines[0])) {
    return { frontmatter: {}, body: clean, warnings: ['missing frontmatter'] };
  }
  const end = lines.findIndex((l, i) => i > 0 && FENCE.test(l));
  if (end === -1) {
    return { frontmatter: {}, body: clean, warnings: ['unterminated frontmatter'] };
  }
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '');
  try {
    const data: unknown = parseYaml(lines.slice(1, end).join('\n'));
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { frontmatter: data as Record<string, unknown>, body, warnings: [] };
    }
    return { frontmatter: {}, body, warnings: ['frontmatter is not a mapping'] };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return { frontmatter: {}, body, warnings: [`invalid YAML: ${msg}`] };
  }
}
