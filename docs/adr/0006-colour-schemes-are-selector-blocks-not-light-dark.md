---
status: accepted
date: 2026-09-15
---

# 0006. Colour schemes are selector blocks, not `light-dark()`

## Context

Dark mode was to be the first step toward a site theme: the chrome and page
content each need a light and a dark scheme, a viewer may choose one or
follow the system, and part of a page — a section with a dark background —
may need the other scheme than the page around it. CSS offers
`light-dark()`, which picks one of two colours by the element's
`color-scheme`.

## Decision

A colour scheme is a **selector block** that redefines every colour-dependent
token for a subtree — the document, or any element pinned with
`data-scheme` — generated from the scheme's tokens in TypeScript by one
emitter. Every block emits the complete set, the derived tokens (hover and
pressed mixes, aliases, the focus ring, shadows) included. The viewer's
preference is `data-color-pref` on `<html>`; a pinned subtree is
`data-scheme`.

## Consequences

- Anything inside a subtree — a primitive inside a query block, a card in a
  dark section — takes the scheme with no code of its own.
- The emitter is the only writer of scheme CSS, and it must emit derived
  tokens in every block: a custom property containing `var()` is substituted
  where it is declared, so a token derived only on `:root` would keep its
  light value inside a dark subtree.
- More schemes than two, such as a high-contrast one, are new token sets, not
  a new mechanism.

## Alternatives considered

- **`light-dark()`**: it caps the model at two schemes, takes colours only, so
  shadows and mix targets cannot follow it, and pinned subtrees would depend
  on how unregistered custom properties resolve.

See [theming.md](../architecture/theming.md).
