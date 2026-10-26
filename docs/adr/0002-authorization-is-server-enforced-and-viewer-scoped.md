---
status: accepted
date: 2026-07-30
---

# 0002. Authorization is server-enforced and viewer-scoped

## Context

The same content is reached by many paths: the pages, the editor, search, the
graph, query blocks embedded in other pages, the GraphQL API and agents over
MCP. A page can show another node's content — a query's results, an embedded
collection — and an agent acts for a person. If any of these paths decided
access on its own, or trusted what a client claims, one of them would show
more than its reader may see.

## Decision

Every access decision is made on the server, through one role check and one
node check, each defined in one place. Whatever a page embeds or a query
returns is resolved as the **current viewer** may read it — never as its
author could, and never with elevated rights. An agent acts as the user who
owns its token. Hiding a control is never the guard: the server checks every
request, whatever the client shows. What a viewer may not read is answered as
if it did not exist; only a signed-out visitor to a page that every signed-in
user may read is sent to sign in instead.

## Consequences

- An embedded query or collection may show different readers different
  things, and a page's rendered HTML is computed per reader.
- Every feature reads nodes through the shared read checks rather than its own
  SQL conditions, and tests hold each surface to them.
- Caching rendered pages across viewers is ruled out for anything a signed-in
  viewer sees.

## Alternatives considered

- **Author-scoped embeds**, where a query runs with its author's rights: it
  turns every page an author writes into a window onto what they can read.
- **Checks in the UI or in each route**: they drift apart as surfaces are
  added, and the first one forgotten is a leak.

See [authorization.md](../architecture/authorization.md).
