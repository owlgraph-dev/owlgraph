<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Popover as BitsPopover } from 'bits-ui';
  import { mergeProps } from 'svelte-toolbelt';
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    side = 'bottom',
    align = 'start',
    sideOffset = 6,
    size = 'auto',
    class: className = '',
    trigger,
    children,
    onCloseAutoFocus,
    onEscapeKeydown,
    disabled = false,
    triggerProps,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    /** `auto`: as wide as its content. `md`: a picker's width, bounded to the window. */
    size?: 'auto' | 'md';
    class?: string;
    /** The trigger button's content. */
    trigger: Snippet;
    children?: Snippet;
    /** `event.preventDefault()` skips Bits UI's refocus on close, for a caller
     * that moves focus itself. */
    onCloseAutoFocus?: (event: Event) => void;
    /** Runs on Escape before `onOpenChange`, for a caller that moves focus on
     * Escape only; `event.preventDefault()` keeps it open. */
    onEscapeKeydown?: (event: KeyboardEvent) => void;
    disabled?: boolean;
    /** Merged last onto the trigger, such as a roving-tabindex group's props
     * (docs/architecture/design-system/patterns.md, "Composing Toolbar with overlay triggers"). */
    triggerProps?: Record<string, unknown>;
  } = $props();
</script>

<BitsPopover.Root bind:open {onOpenChange}>
  <BitsPopover.Trigger {disabled}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <button {...mergeProps(props, triggerProps)} class="ds-popover-trigger">
        {@render trigger()}
      </button>
    {/snippet}
  </BitsPopover.Trigger>
  <BitsPopover.Portal>
    <BitsPopover.Content {side} {align} {sideOffset} {onCloseAutoFocus} {onEscapeKeydown}>
      {#snippet child({ props, wrapperProps }: { props: Record<string, unknown>; wrapperProps: Record<string, unknown> })}
        <div {...wrapperProps}>
          <div {...props} class="ds-popover-content ds-popover-{size} {className}">
            {@render children?.()}
          </div>
        </div>
      {/snippet}
    </BitsPopover.Content>
  </BitsPopover.Portal>
</BitsPopover.Root>

<style>
  /* Not :global(): the elements are this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-popover-trigger {
    all: unset;
    cursor: pointer;
    border-radius: var(--ds-radius-sm);
  }
  /* `all: unset` swallows the app-wide focus ring (docs/architecture/design-system/tokens.md#focus-and-selection-rings). */
  .ds-popover-trigger:focus-visible {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-popover-trigger:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-popover-content {
    /* Above a Dialog: it can open inside one. */
    z-index: var(--ds-z-floating);
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.4rem;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
  }
  .ds-popover-md { width: min(420px, calc(100vw - 2rem)); box-sizing: border-box; }
  .ds-popover-content[data-state='open'] { animation: ds-popover-in 0.12s ease; }

  @keyframes ds-popover-in {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
