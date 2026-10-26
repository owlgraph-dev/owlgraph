<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Two shapes: drive `open` against a `customAnchor` (no trigger, so no hover
  // delay: bits-ui keeps that in its Trigger), or pass a `trigger` snippet for a
  // real Trigger button. `toggle` makes it a toggletip a click or tap pins open:
  // touch has no hover, and bits-ui ignores touch pointers.
  import { Tooltip as BitsTooltip } from 'bits-ui';
  import { mergeProps } from 'svelte-toolbelt';
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    customAnchor,
    side = 'top',
    align = 'center',
    sideOffset = 6,
    delayDuration,
    toggle = false,
    disabled = false,
    class: className = '',
    trigger,
    triggerProps,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** What to position against without a `trigger`: an element, a selector or
     * a virtual `{ getBoundingClientRect() }`. */
    customAnchor?: string | HTMLElement | { getBoundingClientRect: () => DOMRect } | null;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    delayDuration?: number;
    /** A click or tap pins it open, so touch reaches help text. Needs `trigger`. */
    toggle?: boolean;
    /** Dims the trigger button and stops it opening the tooltip. */
    disabled?: boolean;
    class?: string;
    /** The trigger button's content; without it `open` and `customAnchor` drive the tooltip. */
    trigger?: Snippet;
    /** Extra attributes merged (last) onto the trigger button. */
    triggerProps?: Record<string, unknown>;
    children?: Snippet;
  } = $props();

  // While pinned, bits-ui's close is refused (the setter below); a second
  // click, Escape, an outside click or the trigger's blur unpins.
  let pinned = $state(false);
  function unpin() {
    if (!pinned) return;
    pinned = false;
    open = false;
  }
  const toggleProps: Record<string, unknown> = $derived(
    toggle
      ? {
          onclick: () => {
            if (pinned) return unpin();
            pinned = true;
            open = true;
          },
          onblur: unpin,
        }
      : {}
  );
</script>

<BitsTooltip.Provider>
  <BitsTooltip.Root bind:open={() => open, (v) => { if (v || !pinned) open = v; }} {onOpenChange} {delayDuration} disableCloseOnTriggerClick={toggle}>
    {#if trigger}
      <BitsTooltip.Trigger {disabled}>
        {#snippet child({ props }: { props: Record<string, unknown> })}
          <button {...mergeProps(props, toggleProps, triggerProps)} class="ds-tooltip-trigger">
            {@render trigger()}
          </button>
        {/snippet}
      </BitsTooltip.Trigger>
    {/if}
    <BitsTooltip.Portal>
      <BitsTooltip.Content {customAnchor} {side} {align} {sideOffset} onEscapeKeydown={() => (pinned = false)} onInteractOutside={() => (pinned = false)}>
        {#snippet child({ props, wrapperProps }: { props: Record<string, unknown>; wrapperProps: Record<string, unknown> })}
          <div {...wrapperProps}>
            <div {...props} class="ds-tooltip-content {className}" data-pinned={pinned ? '' : undefined}>
              {@render children?.()}
            </div>
          </div>
        {/snippet}
      </BitsTooltip.Content>
    </BitsTooltip.Portal>
  </BitsTooltip.Root>
</BitsTooltip.Provider>

<style>
  /* Not :global(): the elements are this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-tooltip-trigger {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--ds-target-min);
    min-height: var(--ds-target-min);
    cursor: default;
    /* No visible box: the radius only rounds the focus ring. */
    border-radius: var(--ds-radius-sm);
  }
  /* `all: unset` swallows the app-wide focus ring (docs/architecture/design-system/tokens.md#focus-and-selection-rings). */
  .ds-tooltip-trigger:focus-visible {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-tooltip-trigger:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-tooltip-content {
    z-index: var(--ds-z-floating);
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.45rem 0.6rem;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    line-height: 1.4;
    color: var(--ds-color-fg);
    max-width: 260px;
    pointer-events: none;
  }
  /* Pinned, a tap on it must not reach the control underneath. */
  .ds-tooltip-content[data-pinned] { pointer-events: auto; }
  .ds-tooltip-content[data-state='delayed-open'],
  .ds-tooltip-content[data-state='instant-open'] {
    animation: ds-tooltip-in 0.1s ease;
  }

  @keyframes ds-tooltip-in {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
