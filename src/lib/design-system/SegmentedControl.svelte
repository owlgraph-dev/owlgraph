<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `value` is one-way: Bits' own toggling must never become the source of
  // truth (SegmentedControlItem.svelte).
  import { ToggleGroup as BitsToggleGroup } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    type = 'single',
    value,
    onValueChange,
    disabled = false,
    size = 'md',
    stretch = false,
    class: className = '',
    ariaLabel,
    children,
    ...rest
  }: {
    type?: 'single' | 'multiple';
    value: string | string[];
    onValueChange?: (value: string | string[]) => void;
    disabled?: boolean;
    /** `sm` is the compact variant for a narrow panel row. */
    size?: 'sm' | 'md';
    /** Fill the container width, items sharing it equally. */
    stretch?: boolean;
    class?: string;
    ariaLabel?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<!-- The casts only satisfy bits-ui's discriminated union on `type`. -->
<BitsToggleGroup.Root
  type={type as 'single'}
  value={value as string}
  onValueChange={onValueChange as ((v: string) => void) | undefined}
  {disabled}
>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-segmented ds-segmented-{size} {className}" class:ds-segmented-stretch={stretch} aria-label={ariaLabel} {...rest}>
      {@render children?.()}
    </div>
  {/snippet}
</BitsToggleGroup.Root>

<style>
  .ds-segmented {
    display: inline-flex;
    max-width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    overflow: hidden;
  }
  /* Custom properties for the items' scoped CSS (a descendant selector would
     need :global()); item heights leave room for the root's border. */
  .ds-segmented-sm { --ds-seg-h: calc(var(--ds-control-h-sm) - 2px); --ds-seg-minw: var(--ds-control-h-sm); --ds-seg-pad: 0 0.4rem; --ds-seg-font: var(--ds-text-sm); }
  /* Stretched items may shrink below their label, which truncates. */
  .ds-segmented-stretch { display: flex; width: 100%; --ds-seg-flex: 1 1 0; --ds-seg-minw: 0; --ds-seg-pad: 0 0.25rem; }
</style>
