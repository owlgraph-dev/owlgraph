---
status: proposed
date: 2026-11-25
---

# 0020. The core is the graph, and a node's body comes from a plugin

## Context

owlgraph's core is meant to be the knowledge graph: nodes, what they are, what
they carry, how they relate, who may read them and how they are queried.
Pages came first because a self-sufficient instance needs a friendly way to
write and link knowledge, a layer most people need anyway. The code grew
from the page outwards, and the graph is now shaped by it in several places:

- **The class hierarchy holds the storage.** The node types `page`,
  `document` and `collection` head every class's chain, each with a table of
  its own, and foreign keys hold a node's class to its type
  ([semantic-layer.md](../architecture/semantic-layer.md#node-type-is-derived--and-cached)).
  A class under `document` can only be given to documents, and a node's type
  never changes. What a node *is* and how it is *stored* are one choice.
- **Edges are written by page content.** `syncEdges`
  (`graph/graph.server.ts`) rebuilds a page's edges from its document on
  every save and deletes the rest, and an edge records no origin. Apart from
  a collection's members, a relationship cannot be stated without writing it
  into a page. Properties already record where they come from
  (`node_properties.source`: `inline` from the content, `manual` set on the
  node); edges do not.
- **The API grew from the app's own needs.** Reads mostly go through the
  app's load functions, GraphQL only reads, the schema catalogues and the
  namespaces are managed through form actions, and only the MCP server
  accepts a bearer token.
- **Plugins add blocks, sources and node views, not node types**, and they
  are built into the app ([plugins.md](../architecture/plugins.md#the-registry)).

What lies ahead needs the graph to stand on its own: owlgraph run headless,
as the backend of a frontend someone else builds; RDF for nodes and a
cleaner OWL model for the semantic layer; models — of processes, data flows,
organisations and other structures and behaviours — as kinds of node; and
node types that plugins contribute.

## Decision

The core is the graph. It owns a node's identity (id, namespace, slug,
title, language), its class, its properties, its relationships, who may read
and write it, and the queries over all of these, and it offers them through
one public API.

What a node holds beyond that — its **body** — comes from a plugin. Pages are
such a plugin: a page builder on Tiptap that gives a node a body, shipped
with owlgraph and built like any other plugin. Documents, collections and
models are bodies too. A node may have no body at all.

Three things follow, and each is part of this decision:

- **A class is semantics only.** It says what a node is, never how the node
  is stored. Which body a node has is chosen apart from its class.
- **Every statement records its origin.** An edge or a property value is
  stated either directly, through the API or the app, or by a body. Saving a
  body replaces only what that body stated.
- **The core speaks to everyone through its public API**: the app's own
  frontend, plugins, agents and clients that run elsewhere. A headless
  instance is then one whose presentation plugins are off, not a mode of its
  own.

## Consequences

- Headless operation, RDF and models build on the same separation instead of
  each working around the page. A statement's origin maps onto an RDF named
  graph.
- The class hierarchy changes shape: the node types leave it, and the foreign
  keys that hold a class to a type go. Existing classes are kept; how they
  are migrated is open. Every instance's class tree grows on the current
  shape, so the change gets dearer the later it comes.
- Edges get an origin, as property values already have one. Edges from
  content and edges stated directly live side by side, and saving a page no
  longer deletes what the page did not state.
- A body has to be stored, and [decision 0012](0012-a-plugin-keeps-its-state-in-the-hosts-seams.md)
  rules out plugin tables. The host needs a seam for bodies, stored,
  versioned and locked by the core on the plugin's behalf, or 0012 is
  superseded.
- The Plugin Interface grows to node bodies, and the reach of the licence
  shifts with it ([decision 0014](0014-agpl-with-a-plugin-exception.md)): a
  plugin may replace the whole page experience under a licence of its
  author's choosing. The AGPL keeps the graph core open, not every
  experience built on it.
- The public API becomes a promise: versioned, described, changed with
  notice. Refactoring inside the core has to keep it.
- Plugins that bring node types to an instance someone else runs need a way
  to load a plugin that is not built into the app.
- Nothing a reader sees has to change: pages keep their editor and their
  render, and reach the core through the plugin's seams instead of directly.

## Alternatives considered

- **A headless switch on the current model**: turn off the reader and the
  editor and polish the API. Cheap, but a client could state relationships
  only by writing page content, the class would still decide the storage,
  and RDF and models would meet the same coupling again.
- **Content types as plugin code**: each type a plugin defines, with its own
  storage and schema. Classes, property groups and relationship types are
  already data an admin edits; types as code would compete with that layer,
  and an instance's owner would need a build of their own to add one.
- **A separate graph product beside owlgraph**: two codebases sharing one
  model, more to keep true than one person and a few agents can.
