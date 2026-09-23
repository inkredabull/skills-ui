export type SourceKind = 'desktop' | 'user' | 'plugin' | 'project' | 'custom';

export interface SkillSource {
  kind: SourceKind;
  /** Human readable label, e.g. "Claude Desktop" or "spin-doctor@marketplace". */
  label: string;
  /** Absolute directory that contains skill folders. */
  root: string;
  /** Desktop skills are synced from the account, so edits are unsafe. */
  readOnly: boolean;
  /** Plugin name for plugin sources. */
  plugin?: string;
}

export interface DesktopManifestEntry {
  skillId: string;
  name: string;
  description?: string;
  creatorType?: string;
  enabled?: boolean;
  updatedAt?: string;
  backingPluginId?: string;
}

export interface Skill {
  /** Stable id derived from the absolute SKILL.md path. */
  id: string;
  name: string;
  description: string;
  body: string;
  /** Absolute path to the skill directory. */
  dir: string;
  /** Absolute path to SKILL.md. */
  file: string;
  source: Pick<SkillSource, 'kind' | 'label' | 'readOnly' | 'plugin'>;
  /** Present for Claude Desktop skills (from manifest.json). */
  creatorType?: string;
  enabled?: boolean;
  updatedAt: string;
  license?: string;
  frontmatter: Record<string, unknown>;
  bytes: number;
  lines: number;
  /** Names of sibling files/folders (excluding SKILL.md). */
  extras: string[];
  hasScripts: boolean;
  /** Non-fatal problems found while parsing. */
  warnings: string[];
}
