# Skills UI

A local, open-source web UI for getting a holistic overview of your [Agent Skills](https://github.com/anthropics/skills) — built for Claude Desktop, but source-agnostic.

Claude Desktop's skills screen is a flat list. Skills UI merges every place skills live on your machine into one searchable, filterable view.

> **Status: Phase 1 (read-only overview).** Auto-categorization, editing (CRUD) and marketplace packaging are planned; see [Roadmap](#roadmap).

## What it scans

| Source              | Location                                                                                                                  | Editable                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Claude Desktop      | `~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<org>/<account>/skills` (+ `manifest.json`) | No (synced from your account) |
| Cowork plugins      | `~/.claude/plugins/synced/<bucket>/<plugin>`                                                                              | No                            |
| Claude Code plugins | `installPath`s in `~/.claude/plugins/installed_plugins.json`                                                              | No                            |
| Personal skills     | `~/.claude/skills`                                                                                                        | Yes                           |
| Custom folders      | `SKILLS_UI_EXTRA_DIRS`                                                                                                    | Yes                           |

Copies that Claude Code mirrors into `~/.claude/skills/synced/` are de-duplicated against the Desktop store.

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

- `packages/core` — pure Node library: SKILL.md parser, source discovery, scanner, facets. No network.
- `packages/server` — Hono API (`/api/skills`, `/api/skills/:id`, `/api/facets`), bound to `127.0.0.1` only. Serves the built web app.
- `packages/web` — Vite + React + Tailwind. Filtering and sorting run client-side over the skill summaries.

The filesystem is the source of truth; nothing is written to your skills.

## Roadmap

1. ✅ Scanner + read-only overview (grid/table, facets, search, detail drawer)
2. Automatic categories and tags (local embeddings, optional Claude labelling), duplicate detection
3. Create / edit / duplicate / delete with undo
4. Bundle skills into a plugin and generate a `marketplace.json`
5. Polish, CI, `npx skills-ui`

## License

MIT
