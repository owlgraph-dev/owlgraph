---
status: draft
issue:
adrs: ['0001', '0002', '0012', '0014', '0020', '0021', '0022']
updated: 2026-11-25
---

# 004. Headless graph backend

## Problem

Some people need a semantic knowledge graph behind a frontend of their own:
a portal, an app, a data pipeline. Today they would have to take owlgraph's
reader and editor along, or reach for heavier wiki-based stacks. They need
the graph without the pages: model a schema, write and read nodes and their
relationships, query and traverse them under owlgraph's access rules, through
an API they can build on for longer than one release.

This is the first capability that rests on
[decision 0020](../adr/0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md):
the core is the graph, and a body comes from a plugin.

## Scope

- **A headless instance.** An operator turns off owlgraph's own reader and
  editor by configuration. The API and the MCP server go on answering.
- **Tokens.** A client authenticates with a bearer token a person created,
  and acts as that person, as an agent does over MCP.
- **Nodes without a body.** A client creates, reads, changes and deletes
  nodes of any class, with their properties and tags, whether or not the
  node has a body.
- **The schema.** Vocabularies, classes with their shapes, properties and
  relationship types
  ([decision 0021](../adr/0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md))
  can be read and, with the matching permission, managed through the API.
- **Relationships stated directly.** A client states, changes and removes a
  typed relationship between two nodes, with its properties, without writing
  any content.
- **Queries.** Node filters, traversal and search, as the GraphQL API offers
  them today, over every node.
- **Bodies, read.** A node with a body can be read with that body rendered,
  and with what its body states.
- **A stable, described API.** Versioned, described in a machine-readable
  form, and open to the origins the operator allows.

## Non-goals

- Writing a page's body through this API. The editor and the MCP tools keep
  doing that; a body plugin's own write API is the plugin's.
- RDF serializations and SPARQL. They build on this capability and get a spec
  of their own.
- Node types contributed by plugins, and plugins loaded from outside the
  build. Both are part of decision 0020 and get specs of their own.
- Sign-in flows for other apps (OAuth, OpenID Connect). A person makes the
  token.
- Notifications of changes, such as webhooks or a change feed.

## Acceptance criteria

The instance:

1. With the presentation turned off, the reader's and the editor's addresses
   — a node's address, its edit address, the search page, the graph view —
   answer not found. The API and the MCP server answer as they do with it on.
2. A headless instance runs from the published image, switched by
   configuration alone, with no build of its own.

Access:

3. A client authenticates with a bearer token a person created and acts as
   that person: their role, and their access to each node, apply exactly as
   in the app.
4. A request with no token, or a token that names nobody, is refused with the
   API's error body.
5. A node the client may not read is answered as not found by every
   endpoint, as [spec 002](002-visibility-and-namespaces.md) requires of
   every way in. Lists leave it out, and their counts do too.
6. A browser on an origin the operator allows can call the API with a token.
   Any other origin is refused, and no other origin is ever sent the
   session cookie's authority.

Nodes:

7. A client creates a node with no body and any classes, choosing its
   namespace, slug, title, content language and visibility, and sets its
   properties and tags.
8. A client changes and deletes a node it may write, its classes included.
   Changing a node's classes never deletes a property value.
9. Every node reads the same way, with a body or without: its identity, its
   classes, stated and inferred, its properties, its tags and its
   relationships in both directions.

The schema:

10. A client reads the vocabularies, the classes with their shapes, the
    properties and the relationship types, with their labels in every
    language they have, as Settings shows them to the same person.
11. A client with the matching permission creates, changes and deletes them,
    under the same rules Settings enforces.

Relationships:

12. A client states a typed relationship, with its properties, from a node it
    may write to a node it may read, and changes or removes it.
13. Saving a node's body never changes or removes a relationship stated
    directly, and removing a relationship directly never changes a body.
14. Every relationship the API returns says where it comes from: stated
    directly, or stated by the body of a node, and which.

Bodies and queries:

15. A node with a body is read with that body rendered for the reader, and
    with the properties and relationships the body states. The body's stored
    format is not part of the API.
16. Node filters, traversal and search return, for every node with a body or
    without, what the app shows the same person.

Stability:

17. The API's version is part of its address. Within a version a change only
    adds; a change that would break a client comes as a new version, and the
    one before keeps answering for the period the API's documentation
    states.
18. The instance serves a machine-readable description of every endpoint of
    each version it answers. A request the description does not allow is
    refused with the API's error body, naming what is wrong.

## Affected components

- [Semantic layer](../architecture/semantic-layer.md): classes apart from
  bodies, vocabularies, shapes, inference, the schema written through the
  API.
- [Graph view](../architecture/graph-view.md) and the `edges` table: the
  origin of a relationship, relationships stated directly.
- [Authorization](../architecture/authorization.md): tokens on the API,
  allowed origins.
- [Routing](../architecture/routing.md): the `/api` convention, versioned
  addresses, the error body.
- [Dynamic rendering](../architecture/dynamic-rendering.md): the GraphQL API.
- [MCP](../architecture/mcp.md): the same tokens and rules.
- [Plugins](../architecture/plugins.md): bodies as a contribution, the host's
  seam for them.
- [Overview](../architecture/overview.md): the node model, the code layout,
  the shell's routes that turn off.
- [Migrations](../architecture/migrations.md) and
  [Deployment](../guides/deployment.md): the data each instance carries over,
  the configuration that turns the presentation off.

## Decisions and constraints

- [0020. The core is the graph, and a node's body comes from a plugin](../adr/0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
  is `proposed`. This spec is `ready` only once it is accepted.
- [0021. The semantic layer follows RDFS and OWL, and a class's fields are a shape](../adr/0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md)
  is `proposed`: the model of the schema this API serves, and inference
  scoped to what the reader may read.
- [0022. Namespaces are called spaces](../adr/0022-namespaces-are-called-spaces.md)
  is `proposed` and comes before this API's first version; this spec says
  "namespace" until it is made.
- [0002. Authorization is server-enforced and viewer-scoped](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md):
  the API checks every request as the token's person, and
  [spec 002](002-visibility-and-namespaces.md) holds unchanged.
- [0012. A plugin keeps its state in the host's seams](../adr/0012-a-plugin-keeps-its-state-in-the-hosts-seams.md):
  a body is stored through a seam of the host unless 0012 is superseded.
- [0014. AGPL with a plugin exception](../adr/0014-agpl-with-a-plugin-exception.md):
  a client that uses only the public network API is a separate work, so every
  endpoint of a version must be designated public in the documentation, and
  nothing a client needs may be left out of it.
- [0001. Migrations are immutable and forward-only](../adr/0001-migrations-are-immutable-and-forward-only.md):
  separating classes from bodies and giving edges an origin are migrations of
  instances that hold data. No instance loses a class, a property value or
  an edge.
- Tokens travel only over TLS, as the MCP server's do.
- Whether the API runs in the app's process or in its own, as the MCP server
  does, is the implementation's choice, as long as criterion 2 holds.

## Open questions

1. **Class and body.** Decision 0021 settles the classes. Open: how a node
   names its body; one body per node, combined by embedding (proposed), or
   several; and how the classes under `page`, `document` and `collection`
   migrate — proposed: the node types become kinds of body, and *document*
   stays a class that carries the document fields.
2. **Origin of a statement.** Its shape (an origin on each edge, like
   `node_properties.source`, or a named graph per body); whether a body and a
   direct statement of the same relationship make one edge or two; whether a
   relationship a body states can be edited directly.
3. **Where a body is stored.** A seam of the host, stored, versioned and
   locked by the core on a plugin's behalf, or plugin tables superseding
   0012. A page has its document, versions and locks today.
4. **Administration of a headless instance.** Whether Settings and sign-in
   stay on as its admin interface, or all of it moves to the API and the
   command line (`scripts/create-admin.ts` exists).
5. **Writes: REST or GraphQL.** GraphQL mutations beside the queries, or REST
   endpoints for writes with GraphQL for reading. The zod shapes of the MCP
   tools could describe either.
6. **The version policy.** What counts as breaking, and how long the
   previous version answers.
7. **Identifiers.** Terms are named `prefix:name` under a vocabulary's
   namespace IRI (decision 0021). Open: a node's IRI, and whether the API's
   identifiers are already the ones RDF will use, so that RDF later changes
   none of them.
8. **A body as a client reads it.** Whether rendered HTML is enough, or
   clients need a portable form as well, and what of a page's own stylesheet
   and islands comes with its HTML.
9. **The app on its own API.** Which of the app's own reads and writes move
   onto the public API, so that the API is proven by the client that uses it
   most.

## Implementation notes

None yet.
