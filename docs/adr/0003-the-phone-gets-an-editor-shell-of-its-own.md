---
status: accepted
date: 2026-08-13
---

# 0003. The phone gets an editor shell of its own

## Context

The desktop editor is dense and built for a mouse and a keyboard: a
formatting toolbar with popovers, a floating selection overlay, drag handles
that resize a grid's columns, a block settings panel beside the canvas. None
of it survives being squeezed into a phone's width, and touch has no hover,
no precise drag and an on-screen keyboard that takes half the screen.

## Decision

The phone gets a shell of its own around the same editor core: its own head,
a tool strip whose controls open bottom sheets, and its own selection
outline. It is scoped to **editing what exists, not building structure**: a
phone user fixes text, sets typography, links, tags, properties, access,
images and what an embedded node shows, but never builds a grid or a flex
row, a query or a template. Tablets get the desktop editor.

## Consequences

- Each shell can be shaped for its device, and the shared core keeps the
  document, the commands and the edit session the same in both.
- Structural work is a desktop task. The phone shell has no UI for it at any
  nesting depth, and its overlay draws no construction chrome.
- A new editor feature decides, for the phone, whether it belongs to editing
  or to building, and gets the phone's form only if it is editing.

## Alternatives considered

- **One responsive editor.** Every control would need a touch form and a
  layout for each width, and the dense desktop interface would be shaped by
  the phone's limits.

See [editor.md](../architecture/editor.md).
