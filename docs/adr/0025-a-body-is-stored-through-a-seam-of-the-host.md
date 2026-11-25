---
status: accepted
date: 2026-11-25
---

# 0025. A node's body is stored through a seam of the host

## Context

[Decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
makes a node's body a plugin's: pages, documents, collections, later models.
A body has to be stored, with what a page has today: its document, its
versions, the edit lock, the words search finds it by.

[Decision 0012](0012-a-plugin-keeps-its-state-in-the-hosts-seams.md) gives a
plugin no tables of its own. What it stores goes through the host's seams,
and a kind of state the seams cannot hold is a change to the host, made for
every plugin.
[Decision 0023](0023-a-plugin-from-outside-the-build-runs-beside-the-core.md)
proposes that a plugin from outside the build runs as a service that holds
nothing an instance's backup must include.

Parts of such a seam exist. The version store is type-agnostic already: it
owns a version's identity, order, author and kind for any node, and each node
type registers how its payload is written, read and restored
(`pages/versions.server.ts`). A node's record of a source another service
holds is a seam of the host (`source_ref`), and so are the words a plugin
gives search about such a node. The rest belongs to a type: a page's document
and its lock, a document's file, the search text of each.

## Decision

A plugin stores a body through a seam of the host. The core keeps, for the
node:

- the body's **content**, under the name of its kind: structured content,
  files, or the record of a source another service holds;
- its **versions** and the **edit lock**, for a kind that asks for them;
- the **words search finds it by**, which the kind hands over when the body
  is saved.

The content is **opaque to the core**. The core never reads inside a body.
What it needs of one — the statements it makes
([decision 0024](0024-a-statement-records-its-origin.md)), its search words,
its render for a reader — the kind hands over. A plugin reads and writes a
body only through the host, which checks the reader and the writer as for
everything else it hands a plugin.

Decision 0012 stands. A plugin keeps no tables and ships no migrations; the
seam for bodies is the host's, the same for every plugin.

## Consequences

- One database holds everything, and one backup covers it. A body and the
  statements it makes are saved together or not at all.
- A plugin's service holds no state, as decision 0023 asks of it. A plugin
  that runs in the app's process stores its bodies the same way.
- Removing a plugin changes no schema. Its bodies stay stored and come back
  with it, as a removed plugin's blocks do.
- The core cannot query or index inside a body. Whatever should be found,
  filtered or related has to be a statement or a search word the kind hands
  over.
- A change to a kind's stored format is the plugin's to carry: it reads the
  bodies an older release of it wrote. The core's migrations move and rename
  what holds bodies, never what is inside them.
- Versions, the lock and search text become the host's for every kind, and
  the tables that hold a page's, a document's and a collection's content
  become the seam's as those become plugins' kinds. Each is a migration of
  instances that hold data
  ([decision 0001](0001-migrations-are-immutable-and-forward-only.md)).
- A kind whose bodies are large or many is bounded by what the host's storage
  does well. A kind that needs storage of another nature is a change to the
  host, as decision 0012 says.
- The seam is part of the Plugin Interface
  ([decision 0014](0014-agpl-with-a-plugin-exception.md)), and of whatever
  protocol a host and a plugin beside it speak.

## Alternatives considered

- **Plugin tables, superseding 0012**: a plugin could index and query its
  bodies as it likes. But the schema would depend on which plugins are
  installed, a plugin from outside the build would bring a database of its
  own — an instance's backup and its consistency spread across every plugin's
  service — and a body could no longer be saved together with its statements.
- **Content checked against a schema the kind declares**: a broken plugin
  would be caught at the save. It puts a schema language into the Plugin
  Interface and makes every change of a format a change of the contract.
- **Bodies kept by the plugin's service, the core holding a reference**: the
  lightest seam, and what a mirrored collection does with a folder another
  service holds. For content that exists nowhere else it moves the only copy
  out of the instance's backup.
