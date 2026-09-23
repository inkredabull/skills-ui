import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { createProvider } from './provider.js';

const port = Number(process.env.PORT ?? 4173);
const extraDirs = (process.env.SKILLS_UI_EXTRA_DIRS ?? '').split(':').filter(Boolean);
const app = createApp(createProvider(process.env.SKILLS_UI_HOME || undefined, extraDirs));

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
