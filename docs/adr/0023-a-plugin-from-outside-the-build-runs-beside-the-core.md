---
status: proposed
date: 2026-11-25
---

# 0023. A plugin from outside the build runs beside the core and reaches it through the public API

## Context

A plugin runs in the app's process today. It is compiled in, found through
static registry files, held to the contract by the type checker and the
contract test, and kept to its seam by the boundary check
([plugins.md](../architecture/plugins.md)). That works for plugins that live
in owlgraph's repository, and for nothing else: a plugin of an
installation's own means an image of its own
([spec 005](../features/005-plugins-from-outside-the-build.md)).

[Decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
makes plugins the source of every node's body, pages included, and expects
kinds of body that other people write. A plugin from outside the build is
code the instance's operator did not compile and owlgraph's checks never
saw. Loaded into the app's process, it would share the app's memory, its
database connection, its secrets and its failures, and the boundary check
could not reach it.

Other platforms that load code they did not build keep it out of their own
process and talk to it through a declared contract:

- **Kubernetes** stores custom resources generically and leaves their
  behaviour to controllers in containers of their own, which watch for
  changes and coordinate through the stored state, never by calling each
  other. Admission webhooks check a write before it is stored, each with a
  time limit and a rule for when it fails.
- **VS Code** reads an extension's contribution points from its manifest
  without running it, starts it only when needed, and runs it in a process
  of its own that it talks to over RPC.
- **Grafana and Mattermost** run a plugin's server half as a process of its
  own over RPC (HashiCorp's go-plugin) and register its browser half in the
  host's frontend.

owlgraph is more than one process already: the MCP server runs the core's
feature modules beside the app (`src/mcp/server.ts`), and spec 004 lets the
API run in a process of its own. With decision 0020 the core offers one
public API to everyone: its own frontend, agents, clients elsewhere, and
plugins.

## Decision

A plugin that does not ship with owlgraph runs as a **service of its own
beside the core** — in the Compose stack, a container next to the app and
the MCP server — and the instance's configuration names it by its address.

- **It reaches the core only through the public API** and a small protocol
  between host and plugin: registering (its manifest and the interface
  version it speaks), the calls the core makes to it, and the changes it
  follows. It never reaches the database.
- **The core keeps all state.** Nodes, their statements, bodies, settings
  and secrets stay in the core's seams
  ([decision 0012](0012-a-plugin-keeps-its-state-in-the-hosts-seams.md)). A
  plugin's service holds nothing an instance's backup must include.
- **It acts for the viewer.** When the core calls a plugin for a request, it
  hands it a credential that acts as that request's viewer, narrowed to what
  the plugin is granted and to the call's lifetime, so every read the plugin
  makes back is checked as the host checks it today
  ([decision 0002](0002-authorization-is-server-enforced-and-viewer-scoped.md)).
- **Plugins reach each other only through the core**: through the graph and
  the changes to it, never by calling one another.
- **Contributions are declared where they can be.** The manifest says what a
  plugin adds, and the core reads it when the plugin registers. The core
  calls a plugin only at coarse points — a body saved, a body rendered, a
  route — each with a time limit and a stated rule for when the plugin
  fails.
- **One contract, in the process or beside it.** The plugins that ship with
  owlgraph run in the app's process through the same manifest and contract.
  A fresh instance needs no extra service, and reading a page never crosses
  a process.
- **The browser half is the core's to mount.** A plugin's service serves its
  browser code; the core serves it on under the app's own origin and mounts
  it through a contract that names no framework. A block inside a page stays
  one Svelte component
  ([decision 0011](0011-one-svelte-component-draws-a-block-everywhere.md)).

## Consequences

- **The process is the boundary.** A plugin cannot import the core's
  internals or open its database, whoever wrote it. The Plugin Interface's
  rule — the public interface only — holds by construction, not by review.
- **Releases of their own.** One published owlgraph image serves every
  instance; a plugin ships as an image of its own and is updated without a
  new one of owlgraph. An installation with plugins of its own no longer
  builds owlgraph.
- **Any language** for a plugin's server half, since it speaks only the API
  and the protocol.
- **Failure stays with the plugin** on the server: a crash, a leak or a hang
  costs its contributions, not the app. In the browser its code still runs
  in the app's page.
- **Least privilege.** Each plugin gets its own grants, resources and
  network rules, which matters once plugins come from people the operator
  does not know.
- **Calls cost a round trip.** What a plugin contributes to a hot path — a
  list, a traversal, a page read — is a call across processes, so the
  contract stays declarative, and a plugin's answer is kept where it does not
  depend on the reader. A body that embeds the reader's data, such as a
  query block, renders per reader: a plugin that brings such a body pays a
  call per read, or the core fills in the reader's part.
- **Compile-time guarantees become checks at registration.** The type
  checker and the contract test no longer see a plugin from outside the
  build; the core validates its manifest and refuses what breaks the
  contract. What is synchronous in the app's process today — a block's
  server render, block data, node views, agent inputs in one static union —
  is reshaped to cross a process, or stays with plugins in the process.
- **The interface becomes a promise**: versioned, published as a package
  that authors build against, changed with notice. The public API carries
  most of it, so there is one contract to keep stable, not two.
- **More to run.** An instance with plugins from outside the build runs one
  more service for each.
- **Licensing.** A plugin's server half that talks only through the public
  network API is plainly a separate work
  ([decision 0014](0014-agpl-with-a-plugin-exception.md)). Its browser half
  still runs inside the app's page, where the designated interface still
  draws the line. A proprietary plugin that replaces the whole page
  experience, which decision 0020 already allows, becomes easy to ship.
- **Addresses come from the operator.** The core contacts a plugin only at
  an address in its configuration
  ([decision 0009](0009-the-server-never-fetches-an-external-address.md)).

## Alternatives considered

- **Bundles loaded into the app's process at start.** Calls stay cheap and
  the contract stays close to today's, but a foreign plugin shares the app's
  memory, secrets and failures, the boundary check cannot reach it, and
  every plugin is written in TypeScript against the app's own versions of
  Svelte and its other packages.
- **WebAssembly modules the core runs**, through a runtime such as Extism.
  Sandboxed and in the process, with cheap calls; but a module reaches only
  what the host passes in, and a Svelte component cannot be one. A
  candidate for a lighter tier later, beside services.
- **Every plugin as a service, the ones that ship with owlgraph included.**
  One way to load everything, but every page read would cross a process, and
  an instance would need extra services before it could show a page.
- **Plugins calling each other directly.** Faster for a pair that works
  together, but every plugin would depend on others' addresses and versions;
  through the core, the graph is the one place they meet.
