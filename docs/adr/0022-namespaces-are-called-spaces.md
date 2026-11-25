---
status: accepted
date: 2026-11-25
---

# 0022. Namespaces are called spaces

## Context

A namespace in owlgraph is an area of nodes: it gives them an address
prefix, a default visibility and its members
([routing.md](../architecture/routing.md),
[authorization.md](../architecture/authorization.md)). The word is a
developer's, not a reader's, and RDF uses it for something else: the IRI
behind a vocabulary's prefix
([decision 0021](0021-the-semantic-layer-follows-rdfs-and-owl-and-a-class-has-a-shape.md)).
With vocabularies, one word would mean two things in the interface, the docs
and the API. The public API
([spec 004](../features/004-headless-graph-backend.md)) will hold on to
whichever name it ships with.

## Decision

owlgraph's namespaces are called **spaces**, everywhere: the interface, the
docs, the API, the MCP tools, GraphQL, the code and the database.
"Namespace" is left to RDF.

The rename is one change of its own, made before the public API's first
version.

## Consequences

- A mechanical change across the code (some 300 files), a forward-only
  migration that renames tables and columns, and renamed route parameters,
  API fields, MCP tool arguments, GraphQL fields and messages in every
  language.
- Names stored in content are rewritten by that migration: the filter field
  `namespaceId` and the binding key `namespace` that query blocks and their
  templates hold, in every page and in every stored version of one. No
  stored name is left to be read as an alias.
- Specs 002 and 003 and the architecture pages change their wording, and the
  two specs their file names, spec 002's acceptance tests moving with its
  file ([decision 0019](0019-acceptance-tests-live-in-one-folder-per-spec.md));
  their criteria keep their numbers.
- Clients and agents of the current API see renamed fields once, before the
  API is promised stable rather than after. The permission and the error
  codes named after a namespace are renamed with them.
- What a space does stays as it is: its address prefix, its visibility, its
  members. No node's address changes. The app's own addresses that carry the
  word do: the settings section and the API's paths.
- The word has other meanings in the code, such as an XML namespace or a
  group of API paths, and those stay: the rename goes by meaning, not by
  search.

## Alternatives considered

- **Keep "namespace"**: one word for two things, once vocabularies arrive.
- **Rename the interface only**: the code, the API and the docs would speak
  one language and the interface another, and agents read both.
- **"Domain" or "area"**: a domain clashes with `rdfs:domain`; an area says
  less than a space.
