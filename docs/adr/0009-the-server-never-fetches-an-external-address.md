---
status: accepted
date: 2026-10-03
---

# 0009. The server never fetches an external document's address

## Context

A document can be a link to an address elsewhere instead of an uploaded file.
Link previews, favicons, title lookups and broken-link checks would all make
the server request that address — a host an author chose.

## Decision

The server never fetches a link document's address. It validates the address
when it is written (`http` or `https` only, no credentials, a length limit,
a DOI as the one shorthand), shows its host beside the link, and checks it
again where it becomes an `href`. Opening it is the reader's browser's
business, with nothing sent along.

## Consequences

- No server-side request forgery through documents: an author cannot make the
  server reach an internal host.
- The linked host learns nothing about who reads the page until a reader
  follows the link.
- There are no previews, titles or health checks for links; what a reader
  sees is the document's own title and the host.
- The same rule holds wherever owlgraph talks to another service: a plugin's
  requests go only to the address an admin configured, never to one a client
  supplies ([plugins.md](../architecture/plugins.md)).

## Alternatives considered

- **Fetching with an allowlist or a proxy**: it narrows the forgery risk
  without removing it, and still tells hosts who reads what.

See [documents.md](../architecture/documents.md#the-external-address).
