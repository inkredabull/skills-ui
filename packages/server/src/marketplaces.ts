import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MarketplacePlan, PluginPlan } from '@skills-ui/core';

/** A saved, possibly incomplete marketplace. Drafts are validated at preview/export, not on save. */
export interface MarketplaceDraft extends MarketplacePlan {
  id: string;
}

export interface MarketplaceStore {
  list(): Promise<MarketplaceDraft[]>;
  get(id: string): Promise<MarketplaceDraft | undefined>;
  save(draft: MarketplaceDraft): Promise<void>;
  remove(id: string): Promise<boolean>;
}

const ID_RE = /^mp-[a-f0-9]{8}$/;
export const newDraftId = () => `mp-${randomBytes(4).toString('hex')}`;
export const isDraftId = (id: string) => ID_RE.test(id);

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Coerces untrusted JSON into a well-typed draft so nothing unexpected reaches disk or the exporter. */
export function coerceDraft(id: string, input: unknown): MarketplaceDraft {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const owner = (o.owner && typeof o.owner === 'object' ? o.owner : {}) as Record<string, unknown>;
  const plugins = Array.isArray(o.plugins) ? o.plugins.slice(0, 50) : [];
  return {
    id,
    name: str(o.name, 100),
    description: str(o.description),
    owner: {
      name: str(owner.name, 200),
      ...(str(owner.email, 200) && { email: str(owner.email, 200) }),
      ...(str(owner.url, 500) && { url: str(owner.url, 500) }),
    },
    plugins: plugins.map((raw): PluginPlan => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const skills = Array.isArray(p.skills) ? p.skills.slice(0, 500) : [];
      const keywords = Array.isArray(p.keywords) ? p.keywords.slice(0, 30) : [];
      return {
        name: str(p.name, 100),
        description: str(p.description),
        version: str(p.version, 50) || '1.0.0',
        ...(str(p.license, 50) && { license: str(p.license, 50) }),
        ...(str(p.category, 100) && { category: str(p.category, 100) }),
        keywords: keywords.map((k) => str(k, 50)).filter(Boolean),
        skills: skills.map((s) => {
          const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
          return { id: str(r.id, 64), name: str(r.name, 100) };
        }),
      };
    }),
  };
}

export function memoryMarketplaces(): MarketplaceStore {
  const data = new Map<string, MarketplaceDraft>();
  return {
    list: async () => [...data.values()],
    get: async (id) => data.get(id),
    save: async (d) => void data.set(d.id, d),
    remove: async (id) => data.delete(id),
  };
}

export function fileMarketplaces(
  home = process.env.SKILLS_UI_HOME || os.homedir(),
): MarketplaceStore {
  const dir = path.join(home, '.skills-ui', 'marketplaces');
  const file = (id: string) => path.join(dir, `${id}.json`);
  const read = async (id: string) => {
    try {
      return coerceDraft(id, JSON.parse(await fs.readFile(file(id), 'utf8')));
    } catch {
      return undefined;
    }
  };
  return {
    async list() {
      const names = await fs.readdir(dir).catch(() => [] as string[]);
      const drafts = await Promise.all(
        names
          .filter((n) => n.endsWith('.json') && isDraftId(n.slice(0, -5)))
          .map((n) => read(n.slice(0, -5))),
      );
      return drafts.filter((d): d is MarketplaceDraft => d !== undefined);
    },
    get: (id) => (isDraftId(id) ? read(id) : Promise.resolve(undefined)),
    async save(draft) {
      if (!isDraftId(draft.id)) throw new Error('invalid draft id');
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${file(draft.id)}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(draft, null, 2));
      await fs.rename(tmp, file(draft.id));
    },
    async remove(id) {
      if (!isDraftId(id)) return false;
      return fs.rm(file(id)).then(
        () => true,
        () => false,
      );
    },
  };
}
