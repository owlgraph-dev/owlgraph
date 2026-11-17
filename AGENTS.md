# AGENTS.md

Operational guidance for coding agents working in this repository. This file is intentionally **lightweight**: it tells you how to *operate* here. It does **not** explain the system — that lives in [`/docs`](./docs), which is the source of truth for concepts, architecture, and decisions.

> **Before any non-trivial work: read the relevant `/docs` pages.** If a concept isn't in `/docs` yet and you need it, ask or infer from the code — don't invent conventions.

---

## Working style

- **Plan first.** For any non-trivial change, produce a plan and surface findings **before** implementing. Prefer small, self-contained slices over large multi-concern changes.
- **One task per branch and pull request**, squash-merged, its title a lowercase Conventional Commit ([`docs/guides/branches-and-releases.md`](./docs/guides/branches-and-releases.md)). Never push to `main` or `release/*`, and never create a tag.
- **Verify against the code — don't assume.** Inspect the actual implementation (schema, block definitions, existing patterns) before relying on how something "probably" works.
- **Match existing patterns.** This codebase has established conventions (block model, capabilities, migrations, authz). Reuse them; don't introduce parallel approaches.
- **Editor/public parity.** Anything affecting how content renders must render identically in the editor (Tiptap NodeView) and the public renderer. Check both.
- **UI work: follow the UI guide first.** [`docs/guides/building-ui.md`](./docs/guides/building-ui.md) is the procedure (catalog → tokens → grammar → conventions → checklist → verify); `docs/architecture/design-system/` is the reference. Chrome is composed from the design-system primitives and `--ds-*` tokens — a missing primitive is added to the shared library first, never built page-locally.

## Specs and decisions

- **Start from the spec.** A spec in `docs/features/` states what one capability must do, for as long as the capability exists (`docs/adr/0018-a-spec-is-the-standing-statement-of-a-capability.md`). Before planning work on a capability that has one, read it, the decision records it links (`docs/adr/`) and `docs/architecture/overview.md`. The spec says what and why; you work out how.
- **Don't diverge silently.** If the code would contradict a spec or an accepted decision record, stop and say so.
- **Close the loop.** Set the spec's `status` when you start (`in-progress`) and when you finish (`implemented`), record every deviation in its *Implementation notes*, and delete a note that no longer holds — the only parts of a spec you edit. Your implementation plan is not committed; its summary goes into the pull request.
- **Criteria are changed on purpose, never to fit the code.** A change in behaviour arrives as a changed acceptance criterion in the spec you are handed. If your change would make a criterion untrue and the spec does not say so, stop and say so. A criterion's number is never reused.
- **An acceptance test names its criterion.** A test that proves a criterion starts its name with the criterion's id, `NNN.n` (`'002.5 a node the asker may not read is answered as not found'`), at the lowest layer that can observe it.
- **Decision records are read-only.** A decision that changes gets a new record that supersedes the old one; the old one changes only its status.
- **The present follows the code.** A change that alters what `docs/architecture/` or `docs/guides/` describe updates them in the same change.

## Commands

Use the scripts in `package.json` rather than hardcoding equivalents. Key entry points (confirm names in `package.json`):

- Dev / build / preview: the standard SvelteKit scripts.
- **Type/consistency check:** `npm run check` (svelte-check with warnings as errors, the boundary check, the UI convention check, no stray `console`, the paths named in docs and comments, the licence headers) — run after changes. `npm run check:ui` runs the UI check alone; `node scripts/check-ui.mjs --write-baseline` lowers its ratchet after paying down debt.
- **Gate:** `npm run gate` (build, `npm run check`, unit and integration tests, the journeys) — what must be green before merging or deploying. The component tests and the other e2e specs are not in it (`docs/adr/0017-the-gate-runs-unit-integration-and-journeys.md`): run the ones covering what you change before you push, or all of them with `npm run gate:full`.
- **Tests:** write a behaviour's test at the **lowest layer that can observe it** — unit (`*.test.ts`), integration against a real Postgres (`*.int.test.ts`), HTTP on the built handler (`*.http.test.ts`), component in a browser (`*.svelte.test.ts`), E2E only for what only a browser shows (`e2e/*.spec.ts`); `docs/guides/testing.md` has the decision order. Commands: `npm test` (unit), `npm run test:int`, `npm run test:component`, `npm run test:e2e` (every e2e spec against a production build), `node scripts/e2e.mjs journeys` (the journeys alone). While implementing, run the feature's file alone: `npx vitest run <file>`, or `npx playwright test <spec>` (builds first); with a dev server on the test database, `E2E_SERVER=dev npx playwright test <spec>` re-runs a spec without a build. The design-system a11y spec is `src/lib/design-system/e2e`.
- **Migrations:** the migration runner (see `/docs` migrations page). **Do not** apply schema by other means.
- **Docker:** the self-contained compose stack (app, mcp, postgres, migrate).
- **Backup/restore:** the backup and restore scripts.

If a command isn't obvious, check `package.json` and the compose/scripts before guessing.

## Hard rules (violating these causes damage)

- **Migrations are immutable, forward-only.** Every schema/data change = a **new** migration. **Never edit or delete a migration that has already run** anywhere. Never reset a data-bearing database. Rollback = restore from backup, not down-migrations. (See `/docs` migrations.)
- **`schema.sql` is a generated snapshot**, not an applied artifact — never hand-edit it or apply it to a real DB.
- **Authorization is server-enforced and viewer-scoped.** Never trust client-supplied identity. Embedded queries and any dynamic data run under the **current viewer's** permissions. UI gating is never the only guard.
- **Don't reintroduce sanitization/XSS holes.** User/authored HTML and query values that reach HTML must be sanitized/escaped (substitute-then-sanitize). Served document bytes must not become inline-executable on the app origin.

## Conventions

- **SQL-first migrations**, tracked and forward-only.
- **Consistent imports / file layout** — follow the existing module and relative-import structure.
- **No secrets in code or images** — configuration comes from env (see `.env.example`).
- **Docs by time.** `docs/architecture/` and `docs/guides/` describe what is and why — timeless, wiki-style, matching `main`: no "implemented in slice N", no changelog notes. Why a decision was taken and what was rejected is a decision record in `docs/adr/`; what a capability must do, built or planned, is a spec in `docs/features/`. How the work went — slices, steps, timelines — belongs nowhere in `/docs`, nor here. The conventions are in [`docs/README.md`](./docs/README.md#how-these-docs-are-kept).

## Where things are documented

`/docs` is the reference, indexed by what a reader wants to do in [`docs/README.md`](./docs/README.md), which also holds its conventions:

- `docs/architecture/` — how the system is, one page per concept;
- `docs/guides/` — how to run, test and extend it;
- `docs/adr/` — why it is that way, one record per decision;
- `docs/features/` — what owlgraph must do, one spec per capability, built or planned.

The terms that mean something particular here are in `docs/glossary.md`. A new page gets its line in the index. A durable concept goes on its page in `docs/architecture/`; a decision you had to take goes into the spec's implementation notes, or is raised for a decision record — not here. Keep this file short: **operate here, learn there.**
