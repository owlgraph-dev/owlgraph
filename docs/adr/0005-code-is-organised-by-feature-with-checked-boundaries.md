---
status: accepted
date: 2026-09-07
---

# 0005. Code is organised by feature, with checked boundaries

## Context

The code was organised by layer — components here, server modules there —
so one feature's parts were spread across the tree, and nothing said which
module another could use. What a module could reach grew with every import,
and nothing noticed until it cost something: later, one barrel that served
two audiences pulled the whole editor stack (Tiptap and ProseMirror) into the
bundle of the sign-in page and of every public page.

## Decision

`src/lib/` is organised **vertically by feature**: everything a feature owns
lives in `src/lib/features/<feature>/`, and other code reaches it only
through its entry points, one per audience — the browser's index, the
server's `server.ts`, the editor's `editor.ts`, and route adapters under
`routes/` that only `src/routes/` imports. Shared infrastructure is the
platform, the primitives are the design system, and the shell above the
features is imported only by routes and hooks. A script,
`check-boundaries`, part of `npm run check`, fails any import that crosses
these lines. The Tiptap schema of a block stays with the content feature,
beside its renderer, behind the content feature's editor entry — added on
2026-09-22, when that barrel was split by audience.

## Consequences

- A feature can be read, moved or removed as one folder, and its entry points
  are its interface.
- Bundle weight follows the audience: no reader route loads the editor stack,
  and the check keeps it that way.
- A new kind of import between areas is a change to the rules, made on
  purpose, not an accident found later.

## Alternatives considered

- **Layers with conventions only**: the conventions eroded within weeks, and
  the cost showed up as bundle weight nobody had chosen.
- **The Tiptap schema in the editor feature**: a block's attributes are its
  stored data, so the schema would have been split from the renderer that
  reads the same attributes.

See [Code layout](../architecture/overview.md#code-layout-features-platform-shell).
