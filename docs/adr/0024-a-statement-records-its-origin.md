---
status: accepted
date: 2026-11-25
---

# 0024. A statement records its origin, and what a body states is the body's to change

## Context

[Decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
says that every statement records its origin — stated directly, through the
API or the app, or by a body — and that saving a body replaces only what that
body stated. It leaves the shape of an origin open.

Property values already have one (`node_properties.source`): `inline` from a
page's content, `manual` set on the node. The two live side by side. The same
name and value can be stored once from each, and saving the page replaces the
inline rows only. Edges have none: the `edges` table allows one edge per
source, target and relationship type, and saving a page rebuilds every edge
that starts at it. A curated collection's `contains` edges are stated by its
editors; a mirrored collection's are made by its plugin through the host, and
an editor's change to those is refused
([semantic-layer.md](../architecture/semantic-layer.md)).

A statement may be about nodes other than the one whose body makes it: a
model's body — a process, an organisation — relates the nodes it draws to
each other. And a plugin may be removed, or run as a service that cannot be
reached
([decision 0023](0023-a-plugin-from-outside-the-build-runs-beside-the-core.md)),
while the bodies it brought stay stored
([decision 0012](0012-a-plugin-keeps-its-state-in-the-hosts-seams.md)).

Every read is the viewer's
([decision 0002](0002-authorization-is-server-enforced-and-viewer-scoped.md)),
and a reader never learns of a node they may not read
([spec 002](../features/002-visibility-and-namespaces.md)).

## Decision

A statement is a node's stated class, a property value or a relationship.
Each has exactly one origin, recorded on the statement itself:

- **direct**: stated through the API or the app;
- **a body**: the node whose body made the statement, and the plugin its kind
  of body comes from — or none, for a kind the core holds itself.

Tags are the informal layer and are only ever direct. An inferred statement
is not stored and has no origin
([decision 0021](0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md)).

- **What a body states is replaced as a whole.** When a body is saved, the
  core replaces the statements of that origin by the ones the body now makes,
  and touches no other. When a body is removed, they go with it.
- **The same thing said from two origins is two statements.** A body's and a
  direct statement of the same relationship, or of the same property value,
  are stored side by side, each with its origin and, for a relationship, its
  own properties. A reader is shown one relationship with every origin it
  has; traversal, the graph and every count take it once.
- **A body's statement is changed through its body.** Changing or removing it
  directly is refused, and the refusal names the origin. To keep a statement
  whatever the body says later, it is stated directly as well.
- **A statement is readable to a viewer when every node it rests on is**: the
  node it is about, for a relationship the node at its other end, and the
  node whose body stated it. One a viewer may not read is left out as if it
  were not there.
- **Statements outlive their plugin.** When a plugin is removed or cannot be
  reached, the statements its bodies made stay as they were last made, with
  their origin, until the body is saved again or removed. Because an origin
  names the plugin, an administrator can drop or rebuild everything a plugin
  stated.

## Consequences

- Edges get an origin, and more than one edge may join the same two nodes
  under one relationship type, one per origin. Saving a page no longer
  deletes a relationship stated directly from it.
- What is stored today maps without loss. A value from a page's content is
  its body's, a value set on the node is direct. Every edge that starts at a
  page is its body's; a curated collection's members are direct, a mirrored
  collection's its plugin's.
- Every surface that lists relationships — the node header, the graph,
  traversal, the MCP tools, the API — collapses statements of the same
  relationship, and can say where each comes from.
- An origin is a named graph at export: one for the direct statements, one
  per body. No table of graphs is needed for that. Should an origin have to
  carry more — who stated it, an import it came with — a graph can be added
  under the same key.
- A relationship a body states between two other nodes is hidden from a
  reader who may not read the body's node, even one who may read both ends.
  Today a body states only what starts at its own node, so no reader sees
  less than before.
- A body's statement cannot be corrected in place through the API or the
  app. A client is told which body to change.
- The statements of a removed plugin's bodies can go stale, since nothing
  reads a body no plugin understands. That is the price of losing nothing
  when a plugin's service is merely down.
- The core stores a plugin's id with a statement, as it does with a node's
  source, and still names no plugin in its code.

## Alternatives considered

- **A named graph per body**: a table of graphs, each statement pointing at
  one. One place for more data about an origin, and the shape RDF has; but a
  join on every statement read and a row per body, for data nothing needs
  yet.
- **One edge with several origins**: one row and one id per relationship,
  removed with its last origin. The properties an edge carries could differ
  between a body's statement and a direct one, and would need a rule for
  which wins.
- **A direct edit takes the statement over**: the body still says what it
  said, and states it again at its next save.
- **A direct edit written back into the body**: every kind of body would need
  a call that changes it, and a plugin's service would have to be reachable
  for the graph to be edited.
- **Dropping a removed plugin's statements, rebuilt when it returns**:
  consistent with an unknown block, which states nothing. But a plugin that
  is unreachable for an hour would empty part of the graph, and a returning
  one would have every body read again.
