---
status: accepted
date: 2026-10-09
---

# 0011. One Svelte component draws a block everywhere

## Context

A block was drawn twice: by an imperative Tiptap NodeView in the editor and by
a string renderer on the page, and the two had to agree by hand. Every
difference between them was a parity bug — a page that looked different from
what its author saw — and a plugin's blocks would need the same pair. A
spike tested whether one Svelte component could be the NodeView, render on
the server and hydrate on the page, without breaking selection, undo, the
capability cascade, the phone editor or the strict style policy.

## Decision

A block is drawn by **one Svelte component**: mounted as its NodeView in the
editor (`svelteNodeView`), rendered on the server for the page (`ssrBlock`),
and hydrated as an island where it has behaviour on the page. The wrapper
element and the capability carriers are never the component's: the NodeView
and the renderer draw the wrapper — its block id, its classes, its rule id —
and the component renders inside it. Its props are plain JSON, and it never
takes a `style` prop. What it draws is an authored element styled by the
content cascade, never a chrome primitive; a primitive appears in a block only
as a control.

## Consequences

- The editor and the page draw a block from the same markup and the same
  stylesheet, so parity holds by construction.
- Every consumer of the renderer outside Vite — the MCP server, scripts, the
  test harness — compiles Svelte through a loader hook.
- A block without behaviour on the page is no island and ships no client
  code; one with behaviour keeps it in the component, alike in the editor
  and on the page.
- Text blocks whose content ProseMirror owns keep Tiptap's own rendering.

## Alternatives considered

- **The imperative pair**: the parity problem the decision removes.
- **The component owning its wrapper and capabilities**: it would have to
  know the capability cascade and the selection overlay, which stay with the
  NodeView and the renderer.

See [Svelte leaf blocks](../architecture/blocks/anatomy.md#svelte-leaf-blocks).
