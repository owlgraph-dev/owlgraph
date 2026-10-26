<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Anchored to its trigger, so never a bottom sheet: that is BottomSheet, a
  // Dialog variant.
  import { DropdownMenu as BitsDropdownMenu } from 'bits-ui';
  import { mergeProps } from 'svelte-toolbelt';
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    align = 'end',
    sideOffset = 6,
    class: className = '',
    ariaLabel,
    trigger,
    children,
    onCloseAutoFocus,
    disabled = false,
    triggerProps,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    class?: string;
    ariaLabel?: string;
    trigger: Snippet;
    children?: Snippet;
    /** `event.preventDefault()` skips Bits UI's refocus on close, for a caller
     * that moves focus itself. */
    onCloseAutoFocus?: (event: Event) => void;
    /** Disables the trigger, as Popover's. */
    disabled?: boolean;
    /** Merged last onto the trigger, such as a roving-tabindex group's props
     * (docs/architecture/design-system/patterns.md, "Composing Toolbar with overlay triggers"). */
    triggerProps?: Record<string, unknown>;
  } = $props();
</script>

<BitsDropdownMenu.Root bind:open {onOpenChange}>
  <BitsDropdownMenu.Trigger {disabled}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <button {...mergeProps(props, triggerProps)} class="ds-menu-trigger">
        {@render trigger()}
      </button>
    {/snippet}
  </BitsDropdownMenu.Trigger>
  <BitsDropdownMenu.Portal>
    <!-- preventScroll={false}: bits-ui's scroll lock restores <body> through a
         style attribute the strict style-src refuses (platform/csp.ts), which
         leaves `pointer-events: none` on it. An anchored layer needs no lock;
         a modal uses scrollLock.ts. -->
    <BitsDropdownMenu.Content {align} {sideOffset} {onCloseAutoFocus} preventScroll={false} aria-label={ariaLabel}>
      {#snippet child({ props, wrapperProps }: { props: Record<string, unknown>; wrapperProps: Record<string, unknown> })}
        <div {...wrapperProps}>
          <div {...props} class="ds-menu-content {className}">
            {@render children?.()}
          </div>
        </div>
      {/snippet}
    </BitsDropdownMenu.Content>
  </BitsDropdownMenu.Portal>
</BitsDropdownMenu.Root>

<style>
  /* Not :global(): the elements are this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-menu-trigger {
    all: unset;
    cursor: pointer;
    border-radius: var(--ds-radius-sm);
  }
  /* `all: unset` ties the app-wide :focus-visible rule, so the ring is restated
     from the tokens (docs/architecture/design-system/tokens.md, "Focus and selection rings"). */
  .ds-menu-trigger:focus-visible {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-menu-trigger:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* On touch, a 44px target around whatever the snippet shows. */
  @media (pointer: coarse) {
    .ds-menu-trigger { display: inline-flex; align-items: center; justify-content: center; min-width: var(--ds-target-min); min-height: var(--ds-target-min); }
  }
  .ds-menu-content {
    /* Above a Dialog: it can open inside one. */
    z-index: var(--ds-z-floating);
    min-width: 200px;
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.4rem;
    font-family: var(--ds-font-sans);
  }
  .ds-menu-content[data-state='open'] { animation: ds-menu-in 0.12s ease; }

  @keyframes ds-menu-in {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
