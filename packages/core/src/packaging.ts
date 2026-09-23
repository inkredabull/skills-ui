// Browser-safe (no Node imports): shared by the server and the web editor.

export interface Owner {
  name: string;
  email?: string;
  url?: string;
}

export interface SkillRef {
  id: string;
  name: string;
}

export interface PluginPlan {
  name: string;
  description: string;
  version: string;
  license?: string;
  keywords: string[];
  category?: string;
  skills: SkillRef[];
}

export interface MarketplacePlan {
  name: string;
  description: string;
  owner: Owner;
  plugins: PluginPlan[];
}

export interface PlanIssue {
  path: string;
  message: string;
}

/** Names Claude Code reserves for Anthropic, plus package-manager words it refuses. */
export const RESERVED_MARKETPLACE_NAMES = new Set([
  'claude-code-marketplace',
  'claude-code-plugins',
  'claude-plugins-official',
  'claude-plugins-community',
  'claude-community',
  'anthropic-marketplace',
  'anthropic-plugins',
  'agent-skills',
  'anthropic-agent-skills',
  'knowledge-work-plugins',
  'life-sciences',
  'claude-for-legal',
  'claude-for-financial-services',
  'financial-services-plugins',
  'first-party-plugins',
  'claude-tag-plugins',
  'healthcare',
  'npm',
  'pip',
  'uv',
  'cargo',
  'github',
  'gh',
]);

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 64;

const kebabIssue = (label: string, value: string): string | undefined => {
  if (!value) return `${label} is required`;
  if (value.length > NAME_MAX) return `${label} must be at most ${NAME_MAX} characters`;
  if (!KEBAB.test(value))
    return `${label} must be lowercase-kebab-case (letters, numbers, single hyphens)`;
  return undefined;
};

export function validatePlan(plan: MarketplacePlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const add = (path: string, message?: string) => message && issues.push({ path, message });

  add('name', kebabIssue('Marketplace name', plan.name));
  if (RESERVED_MARKETPLACE_NAMES.has(plan.name.toLowerCase())) {
    add('name', `"${plan.name}" is reserved and cannot be used as a marketplace name`);
  }
  if (!plan.owner.name.trim()) add('owner.name', 'Owner name is required');
  if (plan.owner.email && !EMAIL.test(plan.owner.email))
    add('owner.email', 'Owner email is not valid');
  if (plan.owner.url && !/^https?:\/\//.test(plan.owner.url))
    add('owner.url', 'Owner URL must start with http(s)://');
  if (plan.plugins.length === 0) add('plugins', 'Add at least one plugin');

  const seen = new Set<string>();
  plan.plugins.forEach((plugin, i) => {
    const at = (field: string) => `plugins[${i}].${field}`;
    add(at('name'), kebabIssue('Plugin name', plugin.name));
    if (plugin.name && seen.has(plugin.name))
      add(at('name'), `Duplicate plugin name "${plugin.name}"`);
    seen.add(plugin.name);
    if (!SEMVER.test(plugin.version)) add(at('version'), 'Version must be semantic, e.g. 1.0.0');
    if (!plugin.description.trim())
      add(at('description'), 'Description is required so people know what the plugin does');
    if (plugin.skills.length === 0) add(at('skills'), 'Add at least one skill');

    const names = new Set<string>();
    for (const skill of plugin.skills) {
      if (names.has(skill.name)) {
        add(
          at('skills'),
          `Two skills are named "${skill.name}"; rename one (they would share a folder)`,
        );
      }
      names.add(skill.name);
    }
  });
  return issues;
}

export interface Manifests {
  marketplace: Record<string, unknown>;
  plugins: Record<string, Record<string, unknown>>;
}

const clean = <T extends Record<string, unknown>>(obj: T): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  );

/** Generates marketplace.json and one plugin.json per plugin, matching Claude Code's documented schema. */
export function buildManifests(plan: MarketplacePlan): Manifests {
  const author = clean({ ...plan.owner });
  const plugins: Manifests['plugins'] = {};
  for (const p of plan.plugins) {
    plugins[p.name] = clean({
      name: p.name,
      version: p.version,
      description: p.description,
      author,
      license: p.license,
      keywords: p.keywords,
    });
  }
  return {
    marketplace: clean({
      name: plan.name,
      description: plan.description,
      owner: author,
      plugins: plan.plugins.map((p) =>
        clean({
          name: p.name,
          source: `./plugins/${p.name}`,
          description: p.description,
          version: p.version,
          author,
          license: p.license,
          keywords: p.keywords,
          category: p.category,
        }),
      ),
    }),
    plugins,
  };
}
