import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildManifests,
  collectPackage,
  scanPackage,
  SkillWriteError,
  validatePlan,
  writePackage,
  zipPackage,
  type ResolvedPlugin,
  type Skill,
  type SkillRef,
} from '@skills-ui/core';
import type { Context, Hono } from 'hono';
import {
  coerceDraft,
  isDraftId,
  newDraftId,
  type MarketplaceDraft,
  type MarketplaceStore,
} from './marketplaces.js';
import type { SkillProvider } from './provider.js';

const run = promisify(execFile);

export interface PackagingDeps {
  provider: SkillProvider;
  marketplaces: MarketplaceStore;
  /** Where "save to folder" exports are written. */
  exportsDir: string;
}

const STATUS = {
  invalid: 400,
  forbidden: 403,
  'not-found': 404,
  exists: 409,
  conflict: 409,
} as const;

/** Resolves refs by id, then by unique name (ids change if a skill folder is moved). */
export function resolveDraft(draft: MarketplaceDraft, skills: Skill[]) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const unresolved: (SkillRef & { plugin: string })[] = [];
  const resolved: ResolvedPlugin[] = draft.plugins.map((plugin) => ({
    name: plugin.name,
    skills: plugin.skills.flatMap((ref) => {
      const byName = skills.filter((s) => s.name === ref.name);
      const found = byId.get(ref.id) ?? (byName.length === 1 ? byName[0] : undefined);
      if (!found) unresolved.push({ ...ref, plugin: plugin.name });
      return found ? [found] : [];
    }),
  }));
  return { resolved, unresolved };
}

/** Skill refs are stored by id + name; refresh names so a renamed skill does not fail validation. */
function refreshRefs(draft: MarketplaceDraft, skills: Skill[]): MarketplaceDraft {
  const byId = new Map(skills.map((s) => [s.id, s]));
  return {
    ...draft,
    plugins: draft.plugins.map((p) => ({
      ...p,
      skills: p.skills.map((ref) => ({ id: ref.id, name: byId.get(ref.id)?.name ?? ref.name })),
    })),
  };
}

export function registerPackagingRoutes(app: Hono, deps: PackagingDeps): void {
  const { provider, marketplaces, exportsDir } = deps;

  const guarded = async (c: Context, fn: () => Promise<Response>) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SkillWriteError) {
        return c.json({ error: err.message, code: err.code }, STATUS[err.code]);
      }
      throw err;
    }
  };

  const load = async (c: Context) => {
    const id = c.req.param('id') ?? '';
    const draft = isDraftId(id) ? await marketplaces.get(id) : undefined;
    return draft;
  };

  app.get('/api/marketplaces', async (c) => {
    const drafts = await marketplaces.list();
    return c.json(
      drafts
        .map((d) => ({ ...d, issues: validatePlan(d).length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  });

  app.post('/api/marketplaces', async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}));
    const draft = coerceDraft(newDraftId(), body);
    await marketplaces.save(draft);
    return c.json(draft);
  });

  app.put('/api/marketplaces/:id', async (c) => {
    const existing = await load(c);
    if (!existing) return c.json({ error: 'not found' }, 404);
    const draft = coerceDraft(existing.id, await c.req.json().catch(() => ({})));
    await marketplaces.save(draft);
    return c.json(draft);
  });

  app.delete('/api/marketplaces/:id', async (c) => {
    const ok = await marketplaces.remove(c.req.param('id'));
    return ok ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
  });

  app.post('/api/marketplaces/:id/preview', (c) =>
    guarded(c, async () => {
      const stored = await load(c);
      if (!stored) return c.json({ error: 'not found' }, 404);
      // Always rescan: a package must reflect what is on disk now, not a cached listing.
      const skills = await provider.load(true);
      const draft = refreshRefs(stored, skills);
      const { resolved, unresolved } = resolveDraft(draft, skills);
      const issues = validatePlan(draft);
      const ready = issues.length === 0 && unresolved.length === 0;
      return c.json({
        issues,
        unresolved,
        // Files and manifests are only meaningful for a valid plan.
        files: ready ? (await collectPackage(draft, resolved)).map((f) => f.path) : [],
        manifests: ready ? buildManifests(draft) : undefined,
        findings: await scanPackage(resolved),
      });
    }),
  );

  app.post('/api/marketplaces/:id/export', (c) =>
    guarded(c, async () => {
      const stored = await load(c);
      if (!stored) return c.json({ error: 'not found' }, 404);
      const body = (await c.req.json().catch(() => ({}))) as { mode?: string; gitInit?: boolean };
      const skills = await provider.load(true);
      const draft = refreshRefs(stored, skills);
      const { resolved, unresolved } = resolveDraft(draft, skills);
      if (unresolved.length) {
        throw new SkillWriteError(
          `Missing skills: ${unresolved.map((u) => u.name).join(', ')}`,
          'not-found',
        );
      }
      const files = await collectPackage(draft, resolved);

      if (body.mode === 'zip') {
        return c.body(zipPackage(files) as Uint8Array<ArrayBuffer>, 200, {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${draft.name}.zip"`,
        });
      }

      const dir = path.join(exportsDir, draft.name);
      await writePackage(dir, files);
      let git: { initialized: boolean; committed: boolean; message?: string } | undefined;
      if (body.gitInit) {
        git = { initialized: false, committed: false };
        try {
          await run('git', ['init', '-b', 'main'], { cwd: dir });
          git.initialized = true;
          await run('git', ['add', '-A'], { cwd: dir });
          await run('git', ['commit', '-m', `Add ${draft.name} marketplace`], { cwd: dir });
          git.committed = true;
        } catch (e) {
          git.message = e instanceof Error ? e.message.split('\n')[0] : String(e);
        }
      }
      return c.json({ dir, files: files.length, git });
    }),
  );
}
