export type Severity = 'high' | 'low';

export interface Finding {
  kind: string;
  severity: Severity;
  line: number;
  /** Redacted preview; never contains the full secret. */
  preview: string;
}

interface Rule {
  kind: string;
  severity: Severity;
  pattern: RegExp;
  /** Optionally ignore harmless matches (e.g. example addresses). */
  ignore?: (match: string) => boolean;
}

const PLACEHOLDER_EMAIL =
  /@(example\.(com|org|net)|users\.noreply\.github\.com)$|^(noreply|no-reply)@/i;

const RULES: Rule[] = [
  { kind: 'Private key', severity: 'high', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: 'AWS access key', severity: 'high', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'GitHub token', severity: 'high', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { kind: 'Slack token', severity: 'high', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'API key (sk-…)', severity: 'high', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  {
    kind: 'Hard-coded credential',
    severity: 'high',
    pattern:
      /\b(?:api[_-]?key|secret|token|password|passwd)\b["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+=]{16,}/i,
  },
  {
    kind: 'Email address',
    severity: 'low',
    pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
    ignore: (m) => PLACEHOLDER_EMAIL.test(m),
  },
  {
    kind: 'Personal home path',
    severity: 'low',
    pattern: /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+|[A-Z]:\\Users\\[^\\\s]+/,
  },
];

/** Keeps the first characters so a person can find it, hides the rest. */
const redact = (s: string) => (s.length <= 8 ? '…' : `${s.slice(0, 4)}…${'*'.repeat(4)}`);

/** Scans text for secrets and personal details worth a second look before sharing a skill. */
export function scanForSensitive(text: string): Finding[] {
  const findings: Finding[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      const m = rule.pattern.exec(line);
      if (!m || rule.ignore?.(m[0])) continue;
      findings.push({
        kind: rule.kind,
        severity: rule.severity,
        line: i + 1,
        preview: rule.severity === 'high' ? redact(m[0]) : m[0],
      });
    }
  });
  return findings;
}
