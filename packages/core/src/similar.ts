import { tokenize } from './text.js';
import type { Skill } from './types.js';

export interface SimilarPair {
  a: string;
  b: string;
  score: number;
}

type Vector = Map<string, number>;

function vectors(skills: Skill[]): Vector[] {
  const docs = skills.map((s) => tokenize(`${s.name} ${s.description}`));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs.map((d) => {
    const v: Vector = new Map();
    for (const t of d) v.set(t, (v.get(t) ?? 0) + 1);
    for (const [t, tf] of v)
      v.set(t, (1 + Math.log(tf)) * Math.log(1 + docs.length / (df.get(t) ?? 1)));
    return v;
  });
}

const norm = (v: Vector) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));

function cosine(a: Vector, na: number, b: Vector, nb: number): number {
  if (!na || !nb) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) dot += w * (big.get(t) ?? 0);
  return dot / (na * nb);
}

/** TF-IDF cosine similarity between skill descriptions; pairs at or above `threshold`, best first. */
export function findSimilar(skills: Skill[], threshold = 0.5): SimilarPair[] {
  const vs = vectors(skills);
  const ns = vs.map(norm);
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const score = cosine(vs[i]!, ns[i]!, vs[j]!, ns[j]!);
      if (score >= threshold) pairs.push({ a: skills[i]!.id, b: skills[j]!.id, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
