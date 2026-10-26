<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A button look inside an overlay trigger's snippet; the name and title go on
  // the trigger through `triggerProps`. It reads its state from that button: an
  // open overlay paints it active, a disabled trigger drops hover and pressed.
  //   {#snippet trigger()}<TriggerFace variant="toolbar" icon><Icon name="link" /></TriggerFace>{/snippet}
  import type { Snippet } from 'svelte';

  let {
    variant = 'ghost',
    size = 'md',
    icon = false,
    split = false,
    active = false,
    class: className = '',
    children,
  }: {
    /** `toolbar`: ToolbarButton's ghost look; `ghost` / `secondary`: Button's. */
    variant?: 'toolbar' | 'ghost' | 'secondary';
    /** The height: --ds-control-h-*, or --ds-toolbar-h-* for `toolbar`. */
    size?: 'sm' | 'md';
    /** Square, for an icon-only trigger. */
    icon?: boolean;
    /** `toolbar` only: the narrow chevron beside a toolbar item. */
    split?: boolean;
    /** The active look for a state the overlay doesn't know (the caret in a heading). */
    active?: boolean;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<span
  class="ds-trigger-face ds-trigger-face-{variant} ds-trigger-face-{size} {className}"
  class:ds-trigger-face-icon={icon}
  class:ds-trigger-face-split={split}
  class:ds-trigger-face-active={active}
>
  {@render children()}
</span>

<style>
  .ds-trigger-face {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    font-family: var(--ds-font-sans);
    font-weight: var(--ds-weight-medium);
    white-space: nowrap;
    cursor: pointer;
  }

  .ds-trigger-face-toolbar { height: var(--ds-toolbar-h-md); min-width: var(--ds-toolbar-h-md); padding: 0 0.45rem; font-size: var(--ds-text-sm); }
  .ds-trigger-face-toolbar.ds-trigger-face-sm { height: var(--ds-toolbar-h-sm); min-width: var(--ds-toolbar-h-sm); padding: 0 0.3rem; gap: 0.2rem; font-size: var(--ds-text-xs); }
  .ds-trigger-face-toolbar.ds-trigger-face-icon { width: var(--ds-toolbar-h-md); padding: 0; }
  .ds-trigger-face-toolbar.ds-trigger-face-icon.ds-trigger-face-sm { width: var(--ds-toolbar-h-sm); }
  .ds-trigger-face-toolbar.ds-trigger-face-split { min-width: max(1.4rem, var(--ds-target-min)); width: auto; padding: 0 0.15rem; }

  .ds-trigger-face-ghost.ds-trigger-face-sm,
  .ds-trigger-face-secondary.ds-trigger-face-sm { height: var(--ds-control-h-sm); padding: 0 var(--ds-space-sm); font-size: var(--ds-text-sm); }
  .ds-trigger-face-ghost.ds-trigger-face-md,
  .ds-trigger-face-secondary.ds-trigger-face-md { height: var(--ds-control-h-md); padding: 0 0.7rem; font-size: var(--ds-text-md); }
  .ds-trigger-face-ghost.ds-trigger-face-icon.ds-trigger-face-sm,
  .ds-trigger-face-secondary.ds-trigger-face-icon.ds-trigger-face-sm { width: var(--ds-control-h-sm); padding: 0; }
  .ds-trigger-face-ghost.ds-trigger-face-icon.ds-trigger-face-md,
  .ds-trigger-face-secondary.ds-trigger-face-icon.ds-trigger-face-md { width: var(--ds-control-h-md); padding: 0; }
  .ds-trigger-face-secondary { background: var(--ds-color-raised); border-color: var(--ds-color-border); }

  /* State from the trigger button this face sits in. */
  :global(button:not(:disabled):hover) > .ds-trigger-face-toolbar,
  :global(button:not(:disabled):hover) > .ds-trigger-face-ghost { background: var(--ds-color-fill-hover); }
  :global(button:not(:disabled):hover) > .ds-trigger-face-secondary { border-color: var(--ds-color-border-hover); }
  :global(button:not(:disabled):active) > .ds-trigger-face-toolbar,
  :global(button:not(:disabled):active) > .ds-trigger-face-ghost { background: var(--ds-color-fill-pressed); }
  :global(button:not(:disabled):active) > .ds-trigger-face-secondary { background: var(--ds-color-fill-hover); border-color: var(--ds-color-border-hover); }
  .ds-trigger-face-active,
  :global([data-state='open']) > .ds-trigger-face,
  :global(button:not(:disabled):hover) > .ds-trigger-face-active,
  :global(button[data-state='open']:not(:disabled):hover) > .ds-trigger-face { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-color: transparent; }
  :global(button:not(:disabled):active) > .ds-trigger-face-active,
  :global(button[data-state='open']:not(:disabled):active) > .ds-trigger-face { background: var(--ds-color-accent-soft-pressed); }
  :global(button:disabled) > .ds-trigger-face { cursor: default; }
</style>
