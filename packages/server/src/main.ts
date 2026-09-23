import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { createEventBus } from './events.js';
import { fileMarketplaces } from './marketplaces.js';
import { fileOverrides } from './overrides.js';
import { createProvider } from './provider.js';
import { watchRoots } from './watch.js';

const port = Number(process.env.PORT ?? 4173);
const extraDirs = (process.env.SKILLS_UI_EXTRA_DIRS ?? '').split(':').filter(Boolean);
const home = process.env.SKILLS_UI_HOME || os.homedir();
const provider = createProvider(home, extraDirs);
const events = createEventBus();
const app = createApp({
  provider,
  overrides: fileOverrides(home),
  trashDir: path.join(home, '.skills-ui', 'trash'),
  events,
  marketplaces: fileMarketplaces(home),
  exportsDir: path.join(home, '.skills-ui', 'exports'),
});

// Live updates: refresh the cache and nudge open browsers whenever skill folders change on disk.
void provider.watchRoots().then((roots) =>
  watchRoots(roots, () => {
    provider.invalidate();
    events.publish();
  }),
);

// Serve the built web app when present (production / `npx skills-ui`).
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), webDist) }));
  app.get(
    '*',
    serveStatic({ path: path.relative(process.cwd(), path.join(webDist, 'index.html')) }),
  );
}

// Local-only: never bind to a public interface.
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`skills-ui running at http://localhost:${port}`);
});
