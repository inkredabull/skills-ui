import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '../src/parse.js';

describe('parseSkillMarkdown', () => {
  it('parses frontmatter and body', () => {
    const r = parseSkillMarkdown('---\nname: a\ndescription: does a\n---\n\n# Body\n');
    expect(r.frontmatter).toEqual({ name: 'a', description: 'does a' });
    expect(r.body).toBe('# Body\n');
    expect(r.warnings).toEqual([]);
  });

  it('handles folded block scalars in descriptions', () => {
    const r = parseSkillMarkdown('---\nname: a\ndescription: >\n  line one\n  line two\n---\nx');
    expect(r.frontmatter.description).toBe('line one line two\n');
  });

  it('warns when frontmatter is missing', () => {
    const r = parseSkillMarkdown('# Just markdown');
    expect(r.frontmatter).toEqual({});
    expect(r.warnings).toContain('missing frontmatter');
  });

  it('warns on unterminated frontmatter', () => {
    expect(parseSkillMarkdown('---\nname: a\n').warnings).toContain('unterminated frontmatter');
  });

  it('does not throw on invalid YAML', () => {
    const r = parseSkillMarkdown('---\nname: [oops\n---\nbody');
    expect(r.warnings[0]).toMatch(/invalid YAML/);
    expect(r.body).toBe('body');
  });

  it('tolerates CRLF and BOM', () => {
    const r = parseSkillMarkdown('﻿---\r\nname: a\r\n---\r\nbody');
    expect(r.frontmatter.name).toBe('a');
  });
});
