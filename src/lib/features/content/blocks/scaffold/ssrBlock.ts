// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The server half of a Svelte-rendered leaf block (docs/architecture/blocks/anatomy.md, "Svelte
// leaf blocks"). It must emit no style attribute or <style>: the reader routes'
// style-src is strict. Outside Vite it loads through scripts/lib/svelte-hooks.mjs.
import { render } from 'svelte/server';
import type { Component } from 'svelte';

export function ssrBlock<P extends Record<string, unknown>>(component: Component<P>, props: P): string {
  const { head, body } = render(component as Component<Record<string, unknown>>, { props });
  if (head) throw new Error('ssrBlock: a block component renders no <svelte:head>');
  return body;
}
