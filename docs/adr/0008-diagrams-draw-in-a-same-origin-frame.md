---
status: accepted
date: 2026-09-22
---

# 0008. Diagrams draw in a same-origin frame

## Context

The diagram block renders Mermaid source in the browser. Mermaid writes
inline styles as it draws, and a reader's page forbids them
([0007](0007-styles-reach-a-page-through-a-per-page-stylesheet.md)). Drawing
in the page under the strict policy was tried and measured:

- blocked style attributes corrupt Mermaid's measurement of its labels, so
  the diagram comes out the wrong size;
- intercepting the attributes fixes the geometry, but Mermaid's own sanitizing
  parse inherits the page's policy and still violates it;
- Mermaid returns its drawing only as a string, and parsing that string
  reports a violation for every style attribute, even into an inert
  `<template>`.

A `srcdoc`, `about:blank` or `blob:` frame inherits the parent's policy, so
only a document fetched from its own address can have a policy of its own.

## Decision

A diagram draws in an invisible frame of the app's own origin,
`/api/embed/mermaid`, one per document, whose own policy allows inline styles
and which only this origin may frame. The block posts the frame its source and
the content palette at its place; the frame draws, turns every style
attribute into a class scoped to the diagram, lifts the SVG's stylesheet out,
and answers with markup that carries no style attribute, plus the stylesheet.
The block inserts the markup, and the stylesheet under the page's nonce. The
frame is laid out off screen, never `display: none`, since Mermaid measures
text. The editor draws the same way, so it shows exactly what the page will.

## Consequences

- The reader's policy stays strict; the frame's route allows inline styles
  for the drawing alone.
- A diagram appears after the frame has drawn it; the server renders the
  block's waiting state. The frame draws one diagram at a time, since Mermaid
  would otherwise share one palette between two drawings.
- The frame can go when Mermaid draws without style attributes.

## Alternatives considered

- **Drawing in the page**, with or without intercepting its attributes:
  measured above, it cannot be made clean.
- **Rendering diagrams on the server**: it needs a browser on the server to
  measure text.

See [Content scheme](../architecture/theming.md#content-scheme).
