---
status: ready
issue:
adrs: ['0001', '0002', '0012', '0014', '0020', '0021', '0022', '0024', '0025', '0026', '0027', '0028', '0029', '0030']
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
  editor by configuration. Sign-in, Settings, the API and the MCP server go
  on answering.
- **Tokens.** A client authenticates with a bearer token a person created,
  and acts as that person, as an agent does over MCP.
- **Nodes without a body.** A client creates, reads, changes and deletes
  nodes of any class, with their properties and tags, whether or not the
  node has a body.
- **The schema.** Vocabularies, classes with their shapes, properties and
  relationship types ([spec 006](006-semantic-layer.md)) can be read and,
  with the matching permission, managed through the API.
- **Relationships stated directly.** A client states, changes and removes a
  typed relationship between two nodes, with its properties, without writing
  any content.
- **Queries.** Node filters, traversal and search, as the GraphQL API offers
  them today, over every node.
- **Bodies, read.** A node with a body can be read with that body rendered,
  and with what its body states.
- **Identifiers that last.** A node's id, a term's name, and the IRI each
  expands to.
- **A stable, described API.** Versioned, described in a machine-readable
  form, open to the origins the operator allows, and the one the app's own
  browser code uses.

## Non-goals

- Writing a page's body through this API. The editor and the MCP tools keep
  doing that; a body plugin's own write API is the plugin's.
- RDF serializations and SPARQL. They build on this capability and get a spec
  of their own.
- Kinds of body beyond the three there are, and plugins loaded from outside
  the build ([spec 005](005-plugins-from-outside-the-build.md)). The
  protocol between a host and a plugin beside it is no part of this API.
- Sign-in flows for other apps (OAuth, OpenID Connect). A person makes the
  token.
- Tokens that allow less than their person may do. They come with the
  grants of plugins.
- Managing users, the site's settings and integrations through the API.
  Settings does that, on a headless instance too.
- A portable form of a body beside its HTML.
- Notifications of changes, such as webhooks or a change feed. Whether
  plugins follow the graph through change events is a question of spec 005,
  and one mechanism should serve them and this API's clients alike.

## Acceptance criteria

The instance:

1. With the presentation turned off, the addresses readers and authors use —
   a node's address, its edit address, the home page, the search page, the
   graph view, the page a share link opens — answer not found. Sign-in,
   Settings, the About page, the API and the MCP server answer as they do
   with it on.
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

7. A client creates a node with no body and any classes, or none, choosing
   its namespace, slug, title, content language and visibility, and sets its
   properties and tags.
8. A client changes and deletes a node it may write, its classes included.
   Changing a node's classes never deletes a property value.
9. Every node reads the same way, with a body or without: its identity and
   its IRI, its kind of body if it has one, its classes, stated and
   inferred, its properties, its tags and its relationships in both
   directions.

The schema:

10. A client reads the vocabularies, the classes with their shapes, the
    properties and the relationship types, with their IRIs and their labels
    in every language they have, as Settings shows them to the same person.
11. A client with the matching permission creates, changes and deletes them,
    under the same rules Settings enforces.

Relationships:

12. A client states a typed relationship, with its properties, from a node it
    may write to a node it may read, and changes or removes it.
13. Saving a node's body never changes or removes a relationship stated
    directly, and removing a relationship directly never changes a body.
14. Every relationship the API returns says where it comes from: stated
    directly, or stated by the body of a node, and which. A relationship
    stated more than once is returned once, with each of its origins.

Bodies and queries:

15. A node with a body is read with that body rendered for the reader, as
    HTML with the stylesheet it needs and no scripts, and with the
    properties and relationships the body states. The body's stored format
    is not part of the API.
16. Node filters, traversal and search return, for every node with a body or
    without, what the app shows the same person. A filter selects by kind of
    body as by any other field.

Stability:

17. The API's version is part of its address. Within a version a change only
    adds; a change that would break a client comes as a new version, and the
    one before keeps answering until the next major release of owlgraph.
18. The instance serves a machine-readable description of every endpoint of
    each version it answers. A request the description does not allow is
    refused with the API's error body, naming what is wrong.

The app as a client:

19. The app's own browser requests about nodes, relationships, members and
    the schema go to these endpoints, and the instance serves no second
    endpoint for the same thing.

Identifiers and the source:

20. A node's IRI resolves. For a reader who may read the node it leads to
    the node — its address, or the node in the API on a headless instance —
    and for anyone else it is not found.
21. The instance names the source of the version it runs in the API's
    description and on its About page, with the presentation turned off as
    with it on.

## Affected components

- [Semantic layer](../architecture/semantic-layer.md): classes apart from
  bodies, vocabularies, shapes, inference, the schema written through the
  API.
- [Graph view](../architecture/graph-view.md) and the `edges` table: the
  origin of a relationship, relationships stated directly.
- [Authorization](../architecture/authorization.md): tokens on the API,
  allowed origins.
- [Routing](../architecture/routing.md): the `/api` convention, versioned
  addresses, the error body, the address a node's IRI resolves at.
- [Dynamic rendering](../architecture/dynamic-rendering.md): the GraphQL API.
- [MCP](../architecture/mcp.md): the same tokens and rules.
- [Plugins](../architecture/plugins.md): bodies as a contribution, the host's
  seam for them.
- [Overview](../architecture/overview.md): the node model, the code layout,
  the shell's routes that turn off.
- [Migrations](../architecture/migrations.md) and
  [Deployment](../guides/deployment.md): the data each instance carries over,
  the configuration that turns the presentation off, the base IRI.

## Decisions and constraints

- [0020. The core is the graph, and a node's body comes from a plugin](../adr/0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md):
  what this capability rests on. A class is semantics only, every statement
  records its origin, and the core speaks through one public API.
- [0021. The semantic layer follows RDFS and OWL, and a class's fields are a shape](../adr/0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md):
  the model of the schema this API serves, and inference scoped to what the
  reader may read.
- [0022. Namespaces are called spaces](../adr/0022-namespaces-are-called-spaces.md):
  the rename comes before this API's first version; this spec says
  "namespace" until it is made.
- What this spec takes from the records that settle its details:
  - [0024](../adr/0024-a-statement-records-its-origin.md): a statement's
    origin, and that what a body states is changed through the body
    (criteria 13 and 14).
  - [0025](../adr/0025-a-body-is-stored-through-a-seam-of-the-host.md): a
    body is stored through a seam of the host, and
    [decision 0012](../adr/0012-a-plugin-keeps-its-state-in-the-hosts-seams.md)
    stands.
  - [0026](../adr/0026-a-node-has-at-most-one-body-named-by-its-kind.md): a
    node has at most one body, named by its kind (criteria 7, 9 and 16).
  - [0027](../adr/0027-one-rule-says-who-may-change-a-node.md): which nodes
    a client may write (criterion 8).
  - [0028](../adr/0028-a-nodes-iri-is-built-on-its-id.md): the identifiers
    and their IRIs (criteria 9, 10 and 20).
  - [0029](../adr/0029-the-public-api-writes-through-rest-and-queries-through-graphql.md):
    REST for writes and GraphQL for queries, the version policy, the
    description, the app as a client and the form a body is read in
    (criteria 15 and 17 to 19).
  - [0030](../adr/0030-a-headless-instance-keeps-settings.md): what a
    headless instance turns off and what it keeps (criteria 1 and 21).
- [0002. Authorization is server-enforced and viewer-scoped](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md):
  the API checks every request as the token's person, and
  [spec 002](002-visibility-and-namespaces.md) holds unchanged.
- [0014. AGPL with a plugin exception](../adr/0014-agpl-with-a-plugin-exception.md):
  a client that uses only the public network API is a separate work, so every
  endpoint of a version must be designated public in the documentation, and
  nothing a client needs may be left out of it.
- [0001. Migrations are immutable and forward-only](../adr/0001-migrations-are-immutable-and-forward-only.md):
  separating classes from bodies and giving edges an origin are migrations of
  instances that hold data. No instance loses a class of its own making, a
  property value or an edge; the three type classes become kinds of body.
- **Every credential acts as exactly one viewer** and can only narrow what
  that viewer may do, so that a plugin's grants fit the same check later.
- **A query stored in a page lists pages only and keeps doing so.** The
  API's queries reach every node.
- **The limits the app and the agents' server set on a client hold here
  too**: the rate of requests, the size of a body, the bounds of a query.
- Tokens travel only over TLS, as the MCP server's do.
- Whether the API runs in the app's process or in its own, as the MCP server
  does, is the implementation's choice, as long as criterion 2 holds.

## Open questions

None blocks the work.

- Should a client's requests be limited by its token, where they are limited
  by its address today?
- From which release does the promise of criterion 17 hold: the first that
  serves the API, or one that declares it stable?

## Implementation notes

None yet.
