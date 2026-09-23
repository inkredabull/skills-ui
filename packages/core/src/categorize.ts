import { OTHER, TAXONOMY } from './taxonomy.js';
import { stem, terms, tokenize } from './text.js';
import type { Skill } from './types.js';

export interface Categorization {
  category: string;
  /** 0..1, how far ahead the winner is from the runner-up. */
  confidence: number;
  /** Runner-up categories with non-zero score, best first. */
  alternates: string[];
  /** Distinctive terms for this skill, most distinctive first. */
  tags: string[];
}

const MIN_SCORE = 2;
const NAME_WEIGHT = 3;
const DESC_HIT_CAP = 3;

interface Matcher {
  category: string;
  exact: Set<string>;
  prefixes: string[];
}

const MATCHERS: Matcher[] = TAXONOMY.map((c) => ({
  category: c.name,
  exact: new Set(c.keywords.filter((k) => !k.endsWith('*')).map(stem)),
  prefixes: c.keywords.filter((k) => k.endsWith('*')).map((k) => stem(k.slice(0, -1))),
}));

const hits = (m: Matcher, tokens: string[]) => {
  const per = new Map<string, number>();
  for (const t of tokens) {
    if (m.exact.has(t) || m.prefixes.some((p) => t.startsWith(p))) {
      per.set(t, (per.get(t) ?? 0) + 1);
    }
  }
  return per;
};

function scoreCategory(m: Matcher, nameTokens: string[], descTokens: string[]): number {
  let score = 0;
  for (const n of hits(m, nameTokens).values()) score += NAME_WEIGHT * Math.min(n, 1);
  for (const n of hits(m, descTokens).values()) score += Math.min(n, DESC_HIT_CAP);
  return score;
}

/** Document frequency across the library, used to pick distinctive tags. */
export function documentFrequency(skills: Skill[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const s of skills) {
    for (const t of new Set(tokenize(`${s.name} ${s.description}`)))
      df.set(t, (df.get(t) ?? 0) + 1);
  }
  return df;
}

export function extractTags(
  skill: Skill,
  df: Map<string, number>,
  total: number,
  limit = 4,
): string[] {
  const nameStems = new Set(tokenize(skill.name));
  const counts = new Map<string, { tf: number; forms: Map<string, number> }>();
  for (const { stem: st, word } of terms(`${skill.name} ${skill.name} ${skill.description}`)) {
    const entry = counts.get(st) ?? { tf: 0, forms: new Map() };
    entry.tf += 1;
    entry.forms.set(word, (entry.forms.get(word) ?? 0) + 1);
    counts.set(st, entry);
  }
  return [...counts]
    .filter(([t]) => t.length > 3 && !/^\d+$/.test(t))
    .map(([t, { tf, forms }]) => {
      const idf = Math.log((total + 1) / ((df.get(t) ?? 0) + 1));
      // Show the most frequent surface form, preferring the shorter one on ties.
      const [word = t] =
        [...forms].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0] ?? [];
      return { word, w: tf * idf * (nameStems.has(t) ? 1.5 : 1) };
    })
    .sort((a, b) => b.w - a.w || a.word.localeCompare(b.word))
    .slice(0, limit)
    .map((x) => x.word);
}

export function categorizeSkill(
  skill: Skill,
  df: Map<string, number>,
  total: number,
): Categorization {
  const nameTokens = tokenize(skill.name, { isName: true });
  const descTokens = tokenize(skill.description);
  const scored = MATCHERS.map((m) => ({
    category: m.category,
    score: scoreCategory(m, nameTokens, descTokens),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  const [top, second] = scored;
  const tags = extractTags(skill, df, total);
  if (!top || top.score < MIN_SCORE) {
    return {
      category: OTHER,
      confidence: 0,
      alternates: scored.map((s) => s.category).slice(0, 2),
      tags,
    };
  }
  return {
    category: top.category,
    confidence: second ? (top.score - second.score) / top.score : 1,
    alternates: scored.slice(1, 3).map((s) => s.category),
    tags,
  };
}

export function categorizeAll(skills: Skill[]): Map<string, Categorization> {
  const df = documentFrequency(skills);
  return new Map(skills.map((s) => [s.id, categorizeSkill(s, df, skills.length)]));
}
