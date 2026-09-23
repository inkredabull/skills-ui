# Skills UI

A local, open-source web UI for getting a holistic overview of your [Agent Skills](https://github.com/anthropics/skills) — built for Claude Desktop, but source-agnostic.

Claude Desktop's skills screen is a flat list. Skills UI merges every place skills live on your machine into one searchable, filterable view.

> **Status: Phase 2.** Read-only overview with automatic categories, tags and near-duplicate detection. Editing (CRUD) and marketplace packaging are planned; see [Roadmap](#roadmap).

## What it scans

| Source              | Location                                                                                                                  | Editable                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Claude Desktop      | `~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<org>/<account>/skills` (+ `manifest.json`) | No (synced from your account) |
| Cowork plugins      | `~/.claude/plugins/synced/<bucket>/<plugin>`                                                                              | No                            |
| Claude Code plugins | `installPath`s in `~/.claude/plugins/installed_plugins.json`                                                              | No                            |
| Personal skills     | `~/.claude/skills`                                                                                                        | Yes                           |
| Custom folders      | `SKILLS_UI_EXTRA_DIRS`                                                                                                    | Yes                           |

Copies that Claude Code mirrors into `~/.claude/skills/synced/` are de-duplicated against the Desktop store.

## Automatic organization

No setup required — every skill gets a category, tags and a similarity check when scanned:

- **Categories** come from a built-in taxonomy (Engineering, Jobs & career, Finance & ops, …). A skill's name counts more than its description; skills that match nothing land in **Other** rather than being forced into a bucket. Low-confidence guesses show their runner-up in the detail drawer.
- **Tags** are the most distinctive terms in a skill relative to the rest of your library.
- **Near-duplicates** use TF-IDF cosine similarity over name + description (≥ 55%), which surfaces overlapping skills such as an old and a new version of the same workflow.
- **Overrides:** change any category in the detail drawer (or create a new one). Overrides are saved to `~/.skills-ui/overrides.json`, never into your `SKILL.md` files, and you can revert to Auto at any time.

Everything is computed locally and deterministically — no API key, network access or model download.

## Install & run

```bash
npm install
npm run build
npm run start -w @skills-ui/server   # http://localhost:4173
```

Development (API on :4173, Vite dev server with HMR):

```bash
npm run build -w @skills-ui/core
npm run dev -w @skills-ui/server
npm run dev -w @skills-ui/web
```

## Test & lint

```bash
npm test
npm run typecheck
npm run lint
```

## Configuration

See [`.env.example`](.env.example).

| Variable               | Purpose                                        | Default        |
| ---------------------- | ---------------------------------------------- | -------------- |
| `PORT`                 | Server port                                    | `4173`         |
| `SKILLS_UI_EXTRA_DIRS` | Extra skill folders, colon-separated           | —              |
| `SKILLS_UI_HOME`       | Override the home directory used for discovery | `os.homedir()` |

## Architecture

npm workspaces monorepo, TypeScript strict throughout.

- `packages/core` — pure Node library: SKILL.md parser, source discovery, scanner, facets, categorizer, similarity. No network.
- `packages/server` — Hono API (`/api/skills`, `/api/skills/:id`, `/api/categories`, `PUT /api/skills/:id/category`, `/api/facets`), bound to `127.0.0.1` only. Serves the built web app.
- `packages/web` — Vite + React + Tailwind. Filtering and sorting run client-side over the skill summaries.

The filesystem is the source of truth. The only file Skills UI writes is `~/.skills-ui/overrides.json`; writes are same-origin and JSON-only to block cross-site requests.

## Roadmap

1. ✅ Scanner + overview (grid/table, facets, search, detail drawer)
2. ✅ Automatic categories, tags and duplicate detection (local, deterministic). Optional: embeddings / Claude-generated labels
3. Create / edit / duplicate / delete with undo
4. Bundle skills into a plugin and generate a `marketplace.json`
5. Polish, CI, `npx skills-ui`

## License

MIT
