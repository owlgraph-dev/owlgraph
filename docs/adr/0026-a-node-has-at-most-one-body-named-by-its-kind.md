---
status: accepted
date: 2026-11-25
---

# 0026. A node has at most one body, named by its kind, and the type classes go

## Context

[Decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
separates what a node is from what it holds, and leaves three things open:
how a node names its body, whether it may have several, and what becomes of
the classes that are node types today.

A node's type is one of `page`, `document` and `collection`. It is derived
from the node's class, cached on the node, and never changes. The three types
are classes: they sit at the top of every class chain, every node has at
least its type class, and a class below one can be given only to nodes of
that type ([semantic-layer.md](../architecture/semantic-layer.md)). Stored
content relies on that. A query filter names the `page` class's id to mean
every page, a template's `class` key is never empty, and the document type's
class carries the fields every document shows.

A page already shows other nodes inside it: a collection, a document, a
query's results
([blocks/node-embeds.md](../architecture/blocks/node-embeds.md)). And a
collection's own page is the node header with the collection below it; a
node with nothing below is that header alone.

[Decision 0021](0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md)
lets a node have any number of classes and gives a class its fields as a
shape.
[Decision 0023](0023-a-plugin-from-outside-the-build-runs-beside-the-core.md)
proposes that the core calls a plugin beside it only at coarse points.

## Decision

**A node has at most one body, and names it by its kind**: `page`,
`document`, `collection`, or a kind another plugin brings. A node with no
body is a node all the same: its identity, classes, properties, tags and
relationships.

- A node is created with a body or without, and may be given one later. A
  body can be removed, which removes its content and what it stated. A body
  never changes its kind.
- Bodies combine by embedding, not by a node having several: a body may show
  other nodes inside it, each as its reader may read it.
- A kind's name is unique in an instance, and the three kinds there are keep
  theirs.

**A plugin contributes kinds of body, never classes.** A kind works with two
calls, whatever else it offers:

- **the statements a body makes**, asked for when the body is saved, which
  the core stores under that body's origin
  ([decision 0024](0024-a-statement-records-its-origin.md));
- **its render for a reader**, asked for when the node is read.

A kind says whether its render depends on who reads it. One that embeds the
reader's data, such as a query's results, is rendered for each reader.

**The type classes go.** `page`, `document` and `collection` stop being
classes:

- What a type class said of a node, the node's kind of body says. A node
  that had only its type class has no class.
- A class below a type class moves to the top of the hierarchy, and can be
  given to any node.
- The fields every document shows become a shape of their own, which targets
  the nodes with a document body. A shape may target a kind of body as well
  as a class.
- A stored query filter that names a type class is rewritten, in pages and
  in their stored versions, into the same condition on the kind of body.

## Consequences

- "Is a page" keeps selecting every page, as a condition on the kind of
  body. "Is exactly a page" becomes "has a page body and no class", so a
  filter can ask whether a node has a class at all, which none can today.
- A node may have no class. A template's `class` key is then empty where it
  read "Page" for a plain page; the kind of body has a key of its own.
- No instance loses a class of its own making, a property value or an edge.
  The three type classes go, and an admin's own label, description or
  overview page for one goes with it: a kind's name in the interface comes
  from its plugin.
- No class is bound to a kind of body any more. The class picker offers
  every class for every node.
- An address shows a node by its kind of body, and a node without one as the
  node header alone ([routing.md](../architecture/routing.md)).
- Kinds beyond the three come from plugins. A kind a service brings costs a
  call when a body is saved, and a call for each read where its render
  depends on the reader; a render that does not may be kept by the core.
  Whether such a body pays a call per read or has the core fill in the
  reader's part is open
  ([spec 005](../features/005-plugins-from-outside-the-build.md)).
- All of it is a migration of instances that hold data
  ([decision 0001](0001-migrations-are-immutable-and-forward-only.md)).

## Alternatives considered

- **Several bodies per node**: a node that is a page and a model at once.
  Every surface would need a rule for which body an address shows, and a
  node's statements one origin per body. Embedding gives the combination
  with one body each.
- **A body fixed at creation**, as a type is today: a node made through the
  API could never become a page.
- **Kinds that convert in place**: one more call in every kind's contract,
  for a need that removing a body and adding another covers.
- **All three type classes kept as ordinary classes**: no stored filter
  changes and no node loses a class. But "Page" would be a class that says
  nothing of what a node is, and would drift from having a page body.
- **Only *document* kept, carrying the document fields**: the fields stay
  where they are, and one type class is left standing as a class for a
  reason of storage.
