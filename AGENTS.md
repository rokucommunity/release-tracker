## Project Overview

A Svelte 5 + TypeScript SPA that tracks release statuses across RokuCommunity GitHub projects. It fetches package-lock.json files and commit history from GitHub to determine which projects have unreleased changes or outdated dependencies, then displays them as cards.

## Commands

- `npm run dev` - Start Vite dev server
- `npm run build` - Production build (output to `dist/`)
- `npm run preview` - Preview production build
- `npm run check` - Type-check (runs `svelte-check` + `tsc` for node config)

No test framework is configured.

## Architecture

Single-page app with all UI in one Svelte component (`src/App.svelte`). No routing.

- **`src/projects.ts`** - Static project registry defining all RokuCommunity projects, their GitHub repos, release lines (mainline, bsc-v1, roku-deploy-v4), and inter-project dependency graphs. The same project can appear multiple times under different release lines with different branches.
- **`src/App.svelte`** - All application logic and UI. Hydrates projects by fetching `package-lock.json` from GitHub raw URLs and comparing commits via Octokit. Determines update status by checking if dependencies have newer versions and if unreleased (non-chore) commits exist.
- **`src/http.ts`** - HTTP wrapper with localforage caching (for immutable tag responses) and cache-busting (for branch-tip responses). Uses `localforage` for persistent browser storage.
- **`src/util.ts`** - Small helpers (`sleep`, `createClassFactory`).

## Key Concepts

- **Release lines**: Projects are grouped by release line (e.g., "mainline" on `master`, "bsc-v1" on `v1` branch). A project can exist in multiple release lines.
- **Update detection**: A project needs an update if it has unreleased non-chore commits OR any dependency's latest version doesn't match the version used in the project's last release.
- **Hydration**: On load, all projects are hydrated in parallel by fetching branch-tip and tag package-lock.json files, then comparing commits via `octokit.rest.repos.compareCommits`.

## Configuration Notes

- Vite is configured with `base: './'` for relative asset paths
- a11y warnings are suppressed in the Svelte compiler config
- GitHub API rate limiting is handled via `@octokit/plugin-throttling` (unauthenticated requests)
