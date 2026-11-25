---
status: accepted
date: 2026-11-25
---

# 0029. The public API writes through REST, queries through GraphQL, and keeps a version until the next major release

## Context

[Decision 0020](0020-the-core-is-the-graph-and-a-body-comes-from-a-plugin.md)
makes the public API the one way to the core for everyone — the app's own
frontend, plugins, agents, clients elsewhere — and a promise: versioned,
described, changed with notice. What exists grew from the app's needs
([routing.md](../architecture/routing.md),
[dynamic-rendering.md](../architecture/dynamic-rendering.md),
[mcp.md](../architecture/mcp.md)):

- REST-shaped endpoints under `/api/` for what the browser writes — pages,
  documents, a collection's members — which answer every refusal with one
  error body under stable codes;
- a GraphQL API that only reads: node filters, traversal, search and the
  schema's catalogues, with GraphQL's own errors;
- the agents' tools, whose arguments are shapes that check a call and are
  handed to an agent as JSON Schema;
- form actions for Settings, and load functions for the pages.

Only the agents' server accepts a bearer token, and a token acts as its
person in full. A node's kind is called its `type`, the word RDF uses for a
node's class.

owlgraph's releases follow semantic versioning, and while the major version
is 0 a minor release may break
([branches-and-releases.md](../guides/branches-and-releases.md)).
[Decision 0023](0023-a-plugin-from-outside-the-build-runs-beside-the-core.md)
proposes that a plugin beside the core is a client of this API, with a
credential that acts as one viewer.

## Decision

- **Writes and single resources are REST; queries are GraphQL.** A client
  creates, changes, deletes and reads one node, relationship or term of the
  schema through REST endpoints, which answer a refusal with the API's one
  error body. It filters, traverses and searches through GraphQL, which
  stays read-only.
- **The version is part of the address**, for REST and GraphQL alike. Within
  a version a change only adds: an endpoint, an optional input, a field in
  an answer, a code for a new case. Removing or renaming one of these,
  changing what it means or requiring a new input is a new version.
- **A version answers until the next major release of owlgraph.** A new
  version may arrive with any release. The one before it is removed only
  with a major release, and its end is announced when its successor ships.
- **Every version is described in a machine-readable form the instance
  serves**: the REST endpoints from the shapes that check a request, the
  queries by their GraphQL schema.
- **A credential acts as exactly one viewer**, and can only narrow what that
  viewer may do. A person's token acts as that person in full.
- **One API for the browser.** The app's own requests about nodes,
  relationships, members and the schema use these endpoints, and no second
  set exists for the same things. Pages rendered on the server and Settings'
  forms go on calling the core directly.
- **A body is read rendered**: as HTML for its reader, with the stylesheet
  it needs and no scripts. Its stored format is not part of the API.
- **A node's kind of body is called its `body`.** `type` is left to mean a
  class, as in RDF.

## Consequences

- A client learns two styles, each where it fits: writes get HTTP's own
  semantics and one error contract, queries a language made for them.
- While owlgraph's major version is 0, the API's first version answers at
  least until 1.0. Carrying an older version costs until then, so a breaking
  change to the API has to be worth a second version.
- The API's promise is stricter than a release's. A minor release may break
  other things while the major version is 0, never a version of the API.
- A description made from the shapes that check requests cannot drift from
  what the API accepts.
- The app proves the API by using it, and what the app needs of it shows up
  before a client elsewhere asks.
- A narrowed credential, such as a plugin's grants, fits without changing
  how a request is checked: still one viewer, and less than all they may do.
- A client that shows a body gets its layout and colours and none of its
  behaviour: a block that needs a script shows its static form. A portable
  form of a body can be added within a version.
- The node's field and the filter field named `type` are renamed, in the API
  and in stored query filters, with the change that rewrites the filters
  naming a type class
  ([decision 0026](0026-a-node-has-at-most-one-body-named-by-its-kind.md)).
- Every endpoint of a version is designated public in the documentation
  ([decision 0014](0014-agpl-with-a-plugin-exception.md)).

## Alternatives considered

- **GraphQL mutations**: one endpoint and one schema to describe. A second
  error contract for writes, and a duplicate of endpoints the app already
  has.
- **REST for everything**: one style, but clients lose a query language, and
  query blocks and agents keep GraphQL inside anyway.
- **A fixed period, six or twelve months**: a date a client can plan with.
  It would run the API's promise on a clock apart from the releases'.
- **The version in a header**: addresses stay the same across versions, and
  a version is harder to see, to cache and to try by hand.
- **The app as a pure client of the API**, page loads included: the
  strongest proof, a large rewrite and one more hop for every page.
- **A portable form of a body as well**: a client could render it natively,
  and a second format would become a promise.
- **Narrowed tokens from the first version**: built before any plugin uses
  them.
