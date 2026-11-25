---
status: draft
issue:
adrs: ['0002', '0009', '0011', '0012', '0014', '0020', '0023']
updated: 2026-11-25
---

# 005. Plugins from outside the build

## Problem

A plugin is compiled into owlgraph: the registry files list the plugins the
app is built with, and the core finds no other
([plugins.md](../architecture/plugins.md#the-registry)). An installation that
needs a plugin of its own builds its own image from a checkout
([deployment.md](../guides/deployment.md)), the plugin's author works inside
owlgraph's repository, and a new release of either is a new build of both.

[Decision 0020](../adr/0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
makes this the common case. A node's body comes from a plugin, and kinds of
body beyond the ones that ship with owlgraph — models, the body a portal
needs — come from plugins other people write and release on their own.
[Spec 004](004-headless-graph-backend.md) leaves loading them to this spec.

Operators need to add, update and remove a plugin on an instance that runs
the published image. Authors need to build and release a plugin apart from
owlgraph, against an interface that tells both sides when they no longer
fit. And a plugin someone else wrote must not be able to take an instance
down, or to reach further than the host lets it.

## Scope

- **Plugins by configuration.** An operator adds a plugin to an instance
  that runs the published image, updates it and removes it, without building
  owlgraph.
- **Releases of their own.** A plugin is built, versioned and released apart
  from owlgraph, from a repository of its own.
- **A versioned interface.** A plugin names the version of the Plugin
  Interface it was written for; an instance accepts the plugins it can serve
  and says why it refuses the others.
- **The plugins that ship with owlgraph** — Nextcloud, and pages once
  decision 0020 is made — come with a fresh instance and use the same
  interface as any other plugin.
- **Failure kept to the plugin.** A plugin that fails, is slow or is gone
  costs its own contributions, never the instance.
- **The host's guarantees.** A plugin reaches nodes, secrets and other
  services only as the host grants it today, however it is loaded.

## Non-goals

- A catalogue or marketplace of plugins, and installing a plugin from inside
  the app.
- What a body is, how it is stored and how a node names it. Bodies as
  plugins get a spec of their own (decision 0020); this spec loads the
  plugins that bring them.
- Plugin tables. A plugin keeps its state in the host's seams
  ([decision 0012](../adr/0012-a-plugin-keeps-its-state-in-the-hosts-seams.md)).
- Plugins that change the core. A plugin reaches it only through the Plugin
  Interface ([decision 0014](../adr/0014-agpl-with-a-plugin-exception.md)).

## Acceptance criteria

Adding, updating, removing:

1. An operator adds a plugin to an instance that runs the published image,
   by configuration alone, with no build of owlgraph. Its contributions are
   there once the instance has restarted, at the latest.
2. A plugin is updated to a new release of its own without a new owlgraph
   image, and a new owlgraph release keeps every plugin that speaks an
   interface version the release serves.
3. Removing a plugin changes no schema. What it contributed to content
   behaves as decision 0012 describes for a removed plugin, and comes back
   when the plugin returns.

The interface:

4. A plugin names the version of the Plugin Interface it was written for.
   An instance refuses a plugin whose version it does not serve, or whose
   declared contributions break the contract, when it loads it; it says why
   in the log and under Settings → Integrations, and runs on without it.
5. The documentation of each release states the interface versions it
   serves and designates them public, as decision 0014 requires of the
   plugin loading mechanism.

The plugins that ship with owlgraph:

6. A fresh instance from the published image has the plugins that ship with
   owlgraph, with no configuration beyond the settings they need today.
7. A plugin that ships with owlgraph can be removed by configuration and
   added back, like any other plugin.

Failure and trust:

8. A plugin that fails, answers more slowly than a limit the documentation
   states, or cannot be reached costs only its own contributions: pages, the
   API, the MCP server and every other plugin go on answering, and what the
   plugin would have drawn shows that it is unavailable.
9. A plugin reads and writes nodes only as the host's rules allow
   ([The host](../architecture/plugins.md#the-host)): every read checked for
   the viewer, every write for the writer, a secret opened only for its node
   or person. [Spec 002](002-visibility-and-namespaces.md) holds for every
   plugin, however it is loaded.
10. The instance contacts a plugin, and a plugin's requests reach other
    services, only at addresses the operator configured. Nothing a plugin or
    a client supplies adds one
    ([decision 0009](../adr/0009-the-server-never-fetches-an-external-address.md)).

Authoring:

11. An author builds, checks and tests a plugin in a repository of their
    own, against a published package of the Plugin Interface, without a
    checkout of owlgraph. The checks that hold a plugin to the contract today
    run there too.

## Affected components

- [Plugins](../architecture/plugins.md): the loading mechanism, the
  registry, the contract and its checks, the host, the boundaries.
- [Writing a plugin](../guides/writing-a-plugin.md): where a plugin lives,
  how it is built, checked and registered.
- [Deployment](../guides/deployment.md): what a published image holds, how
  an operator adds a plugin to the Compose stack.
- [MCP](../architecture/mcp.md): the agent inputs a plugin adds, which join
  one static union today.
- [Settings](../architecture/settings.md): the Integrations group, a plugin
  refused and why.
- [Logging](../architecture/logging.md): loading and refusing a plugin, a
  plugin that fails.
- [Overview](../architecture/overview.md): the code layout and the boundary
  check.

## Decisions and constraints

- [0020. The core is the graph, and a node's body comes from a plugin](../adr/0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
  is `proposed`. It names this capability among its consequences.
- [0023. A plugin from outside the build runs beside the core and reaches it through the public API](../adr/0023-a-plugin-from-outside-the-build-runs-beside-the-core.md)
  is `proposed`: how such a plugin runs. This spec is `ready` only once 0020
  and 0023 are accepted, or 0023 is replaced by another record.
- [0014. AGPL with a plugin exception](../adr/0014-agpl-with-a-plugin-exception.md):
  the plugin loading mechanism is part of the Plugin Interface, so whatever
  this spec adds is designated public for each release, and a plugin that
  uses only the interface stays a separate work.
- [0012. A plugin keeps its state in the host's seams](../adr/0012-a-plugin-keeps-its-state-in-the-hosts-seams.md):
  what a plugin stores goes through the host, wherever the plugin runs.
- [0009. The server never fetches an external document's address](../adr/0009-the-server-never-fetches-an-external-address.md):
  every address the instance or a plugin contacts comes from the operator.
- [0011. One Svelte component draws a block everywhere](../adr/0011-one-svelte-component-draws-a-block-everywhere.md):
  a plugin that adds blocks to pages follows it, whatever it uses for its
  other parts.
- [0002. Authorization is server-enforced and viewer-scoped](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md):
  the host's checks hold for every plugin, and a plugin's browser half is
  never the guard.
- The published image stays the repository's code and the plugins that ship
  with it ([deployment.md](../guides/deployment.md)). A plugin from outside
  the build is never part of it.

## Open questions

1. **How a plugin runs.** Proposed in decision 0023: as a service of its own
   beside the core, reaching it through the public API, while the plugins
   that ship with owlgraph run in the app's process through the same
   contract. Weighed against it: bundles loaded into the app's process at
   start, and WebAssembly modules the core runs.
2. **What crosses a process boundary.** Several contributions run
   synchronously in the app's process today: a block's server render, block
   data resolved before a page renders, node views, agent inputs joined into
   one static union. Which of them a plugin from outside the build may
   contribute, and how; which stay with plugins in the process. A body whose
   render depends on the reader — query blocks, block data — cannot be kept
   per body version alone.
3. **The browser half.** How the core loads and mounts the editor, node
   views and settings of a plugin from outside the build: a mount function
   with a context that names no framework (proposed), custom elements, or a
   frame, as diagrams use
   ([decision 0008](../adr/0008-diagrams-draw-in-a-same-origin-frame.md)).
   Whether parts other than blocks may use a framework other than Svelte,
   and what of the design system such a part can use.
4. **Discovery.** A list of plugin addresses in the instance's
   configuration (proposed, as decision 0009 asks), or a plugin announcing
   itself to an address the operator gave it.
5. **A plugin's permissions.** What a plugin may do beyond what the viewer
   it acts for may, how an operator grants it, and how a plugin
   authenticates to the core.
6. **Change events.** Whether plugins follow the graph through change
   events, and whether those are the change feed spec 004 leaves out for
   headless clients.
7. **The version policy.** How long a release serves an older interface
   version, and how that relates to the API's version policy (spec 004,
   open question 6).
8. **The licence's reach.** With bodies from plugins, a plugin under any
   licence can replace the whole page experience (decision 0020). Whether
   plugins from outside the build change what the exception should allow.

## Implementation notes

None yet.
