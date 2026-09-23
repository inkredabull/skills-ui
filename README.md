# Skills UI

A local, open-source web UI for getting a holistic overview of your [Agent Skills](https://github.com/anthropics/skills) — built for Claude Desktop, but source-agnostic.

Claude Desktop's skills screen is a flat list. Skills UI merges every place skills live on your machine into one searchable, filterable view.

> **Status: Phase 4.** Browse, auto-categorize, edit, and package skills into shareable Claude Code plugin marketplaces. Polish and `npx skills-ui` are next; see [Roadmap](#roadmap).

## What it scans

| Source              | Location                                                                                                                  | Editable                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Claude Desktop      | `~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<org>/<account>/skills` (+ `manifest.json`) | No (synced from your account) |
| Cowork plugins      | `~/.claude/plugins/synced/<bucket>/<plugin>`                                                                              | No                            |
| Claude Code plugins | `installPath`s in `~/.claude/plugins/installed_plugins.json`                                                              | No                            |
| Personal skills     | `~/.claude/skills`                                                                                                        | Yes                           |
| Custom folders      | `SKILLS_UI_EXTRA_DIRS`                                                                                                    | Yes                           |

Copies that Claude Code mirrors into `~/.claude/skills/synced/` are de-duplicated against the Desktop store.

## Editing skills

Editable sources (Personal, custom folders) support full CRUD from the UI:

- **New skill** — name, description and Markdown instructions from a template. Names are validated live (`lowercase-with-hyphens`, ≤ 64 chars; description ≤ 1024).
- **Edit** — changes name-locked `description` and body; every other frontmatter key (e.g. `license`) is preserved. Saves are atomic, and a save is **blocked if the file changed on disk** after you opened it, so edits made in another editor are never silently overwritten.
- **Duplicate** — copies the whole folder (scripts and assets included). On read-only sources (Claude Desktop, plugins) this is **Duplicate to Personal**, which gives you an editable copy.
- **Delete** — moves the folder to `~/.skills-ui/trash/` and offers **Undo**; restore refuses to overwrite anything created since.
- **Live updates** — the server watches your editable folders and the Desktop store, so changes made in a terminal or editor appear without a refresh.

Claude Desktop's own store and plugin folders are never written to.

## Packaging a marketplace

Turn any set of skills into a plugin marketplace that others can install:

1. On the **Skills** page, tick the skills you want and choose **Add to plugin…** (new or existing marketplace and plugin).
2. On the **Marketplaces** page, fill in the owner, plugin descriptions, versions and license. Everything autosaves to `~/.skills-ui/marketplaces/`, and validation runs as you type (kebab-case names, reserved marketplace names, semver, duplicate skill names).
3. **Review before sharing** — every file that would be published is scanned for API keys and tokens, private keys, email addresses and personal home paths (e.g. `/Users/you`). Secrets are shown redacted. Export stays locked until you confirm you've reviewed the findings.
4. **Download .zip** or **Save to folder** (optionally `git init` + first commit). Push the folder to GitHub, then anyone can run:

```
/plugin marketplace add <github-owner>/<repo>
/plugin install <plugin>@<marketplace>
```

The output follows Claude Code's [documented layout](https://code.claude.com/docs/en/plugin-marketplaces): `.claude-plugin/marketplace.json`, and per plugin `plugins/<name>/.claude-plugin/plugin.json` plus `skills/<skill>/` (symlinks are dereferenced; `node_modules` and `.git` are skipped; each `SKILL.md` gets an explicit `name`). Exports are also checked against `claude plugin validate .` during development.

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
- `packages/server` — Hono API for reading, editing and live events (`/api/skills`, `/api/categories`, `/api/targets`, `/api/events`, and POST/PUT/DELETE on skills), bound to `127.0.0.1` only. Serves the built web app.
- `packages/web` — Vite + React + Tailwind. Filtering and sorting run client-side over the skill summaries.

The filesystem is the source of truth. Skills UI writes only to editable skill folders you act on, plus its own `~/.skills-ui/` directory (category overrides, trash, marketplace drafts and exports); writes are same-origin and JSON-only to block cross-site requests.

## Roadmap

1. ✅ Scanner + overview (grid/table, facets, search, detail drawer)
2. ✅ Automatic categories, tags and duplicate detection (local, deterministic). Optional: embeddings / Claude-generated labels
3. ✅ Create / edit / duplicate / delete with undo, live updates
4. ✅ Bundle skills into plugins, generate `marketplace.json`, pre-publish safety scan, zip / folder / git export
5. Polish, CI, `npx skills-ui`

## License

MIT
