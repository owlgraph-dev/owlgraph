<!--
The title is a lowercase Conventional Commit, such as `feat: add subgraph
export` or `fix: handle an empty class`; a squash merge makes it the commit
message on main (docs/guides/branches-and-releases.md).
-->

## What and why

## How it was checked

- [ ] `npm run gate` is green — or what was run instead, and why
- [ ] The component tests and e2e specs covering what the change touches ran
      (`npx vitest run <file>`, `npx playwright test <spec>`), or
      `npm run gate:full` — or none cover it
- [ ] The docs in `docs/architecture/` or `docs/guides/` that the change makes
      untrue are updated
- [ ] Every commit is signed off (`git commit -s`)
