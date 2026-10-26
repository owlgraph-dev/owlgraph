---
status: accepted
date: 2026-08-18
---

# 0004. NULL means inherit

## Context

Much of owlgraph's data either takes a value from something above it or
overrides it: a node's visibility from its namespace's access level, a
block's padding from the site's defaults, a tablet's value from the
desktop's, a page's width from the site's. The first design for a node's
visibility stored an always-concrete value beside a flag saying whether it
was overridden — two columns that can disagree, and a flag that says nothing
the value's presence could not.

## Decision

An inheriting value is **absent** when unset — a NULL column, a missing key,
no custom property — and present when it overrides. Its effective value is
the override if there is one, else what is above it
(`node.visibility ?? namespace.access_level`). Nothing stores a value beside
a flag that only restates whether the value is set. The same rule runs
through content: a capability field the author left at Auto is stored as
nothing and emitted as nothing.

## Consequences

- A record says exactly what was chosen, and nothing it would say by
  coincidence: a node that inherits keeps inheriting when its namespace
  changes.
- A value that equals the inherited one is kept when it was set on purpose,
  and shows again when what is above it moves.
- Every reader resolves the chain the same way, and every writer clears a
  value by removing it, never by writing the default.

## Alternatives considered

- **A concrete value with an "overridden" flag**: two sources of truth and a
  state space with contradictions in it.
- **Materialized defaults**: copying the inherited value down freezes it, so
  changing a default no longer reaches what inherited it.
- **A namespace's access level applied only when a node is created**: it left
  the read path untouched, but gave the level no meaning once nodes existed.

See [Capability defaults](../architecture/blocks/capabilities.md#capability-defaults)
and [authorization.md](../architecture/authorization.md#namespaces-access_level-is-a-live-default-overridable-per-node).
