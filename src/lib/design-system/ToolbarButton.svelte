<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A plain toolbar item (ToolbarGroupItem toggles). Bits' Toolbar.Button has no
  // Enter/Space handling, so the native click reaches `onclick`. The look
  // mirrors ToolbarGroupItem's by hand.
  import { Toolbar as BitsToolbar } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    variant = 'ghost',
    size = 'md',
    active = false,
    disabled = false,
    class: className = '',
    onclick,
    children,
    ...rest
  }: {
    /** `ghost-danger`: the quiet destructive command, Button's in the toolbar's density. */
    variant?: 'ghost' | 'primary' | 'ghost-danger';
    /** `sm`: the in-canvas block tools' footprint, floating over content. */
    size?: 'sm' | 'md';
    active?: boolean;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<BitsToolbar.Button {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <button
      {...props}
      {onclick}
      class="ds-toolbar-button ds-toolbar-button-{variant} ds-toolbar-button-{size} {active ? 'ds-toolbar-button-active' : ''} {className}"
      {...rest}
    >
      {@render children?.()}
    </button>
  {/snippet}
</BitsToolbar.Button>

<style>
  .ds-toolbar-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    height: var(--ds-toolbar-h-md);
    min-width: var(--ds-toolbar-h-md);
    padding: 0 0.45rem;
    border: 1px solid transparent;
    border-radius: var(--ds-radius-sm);
    font: inherit;
    color: var(--ds-color-fg);
    cursor: pointer;
  }
  .ds-toolbar-button-sm { height: var(--ds-toolbar-h-sm); min-width: var(--ds-toolbar-h-sm); padding: 0; gap: 0.2rem; }
  .ds-toolbar-button-ghost,
  .ds-toolbar-button-ghost-danger { background: none; }
  .ds-toolbar-button-ghost:not([data-disabled]):hover { background: var(--ds-color-fill-hover); }
  /* Recolours the focus ring like Button's primary: accent on accent is 1:1. */
  .ds-toolbar-button-primary {
    padding: 0 0.9rem;
    font-weight: var(--ds-weight-medium);
    border-color: var(--ds-color-accent);
    background: var(--ds-color-accent);
    color: var(--ds-color-on-accent);
    --ds-focus-ring-color: var(--ds-color-on-accent);
    --ds-focus-ring-offset: var(--ds-focus-ring-offset-filled);
  }
  .ds-toolbar-button-primary:not([data-disabled]):hover { background: var(--ds-color-accent-hover); border-color: var(--ds-color-accent-hover); }
  .ds-toolbar-button[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-toolbar-button-active { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); }
  .ds-toolbar-button-ghost-danger:not([data-disabled]):hover { background: var(--ds-color-danger-soft); color: var(--ds-color-danger); }
  .ds-toolbar-button-ghost:not([data-disabled]):active { background: var(--ds-color-fill-pressed); }
  .ds-toolbar-button-primary:not([data-disabled]):active { background: var(--ds-color-accent-pressed); border-color: var(--ds-color-accent-pressed); }
  .ds-toolbar-button-ghost-danger:not([data-disabled]):active { background: var(--ds-color-danger-soft-pressed); color: var(--ds-color-danger); }
  .ds-toolbar-button-active:not([data-disabled]):active { background: var(--ds-color-accent-soft-pressed); }
</style>
