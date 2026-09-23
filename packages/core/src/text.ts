const STOPWORDS = new Set(
  `a an and are as at be but by for from has have if in into is it its of on or that the their this to use used using when with without you your not can will should also any all each per via
  user users skill skills claude anthropic trigger triggers triggered whenever says asks ask asked ask run runs running need needs want wants such other more most etc e g i eg like get gets make makes new one two`.split(
    /\s+/,
  ),
);

/** Light suffix stripping so "plans"/"planning"/"planner" collapse together. */
export function stem(word: string): string {
  return word
    .replace(/(ing|ers|er|ed|es|s)$/, (m, _s, offset: number) => (offset >= 4 ? '' : m))
    .replace(/(.)\1$/, '$1');
}

const SHORT_ALLOWED = new Set(['ai', 'ci', 'cd', 'cv', 'hr', 'ui', 'ux', 'qa']);

/** Words that are noise in descriptions but meaningful in a skill's name (e.g. "skill-creator"). */
const NAME_ONLY = new Set(['skill', 'skills', 'claude']);

export interface Term {
  stem: string;
  word: string;
}

/** Tokens with both their stem (for matching) and the original word (for display). */
export function terms(text: string, opts: { isName?: boolean } = {}): Term[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]*[a-z0-9+#]|[a-z]/g) ?? [])
    .flatMap((w) => w.split(/[-.]/))
    .filter(
      (w) =>
        (w.length > 2 || SHORT_ALLOWED.has(w)) &&
        (!STOPWORDS.has(w) || (opts.isName === true && NAME_ONLY.has(w))),
    )
    .map((word) => ({ stem: stem(word), word }));
}

export function tokenize(text: string, opts: { isName?: boolean } = {}): string[] {
  return terms(text, opts).map((t) => t.stem);
}
