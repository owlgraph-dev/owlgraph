<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts" module>
  /** The nine anchor points, in reading order — the grid's cells. */
  export const POSITIONS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
  export type Position = (typeof POSITIONS)[number];
</script>

<script lang="ts">
  // A 3×3 anchor-point picker (an image's focal point): a ToggleGroup with
  // SegmentedControl's one-way `value` and click / Enter / Space guards
  // (SegmentedControlItem.svelte says why).
  import { ToggleGroup as BitsToggleGroup } from 'bits-ui';

  let {
    value,
    onValueChange,
    labels,
    ariaLabel,
    disabled = false,
    class: className = '',
  }: {
    value: Position;
    onValueChange?: (value: Position) => void;
    /** Each cell's accessible name (and title), e.g. "Top left". */
    labels: Record<Position, string>;
    ariaLabel?: string;
    disabled?: boolean;
    class?: string;
  } = $props();

  function pick(p: Position) {
    if (!disabled) onValueChange?.(p);
  }
</script>

<BitsToggleGroup.Root type="single" {value} {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-position-grid {className}" aria-label={ariaLabel}>
      {#each POSITIONS as p (p)}
        <BitsToggleGroup.Item
          value={p}
          {disabled}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick(p);
            }
          }}
          onclick={(e: MouseEvent) => {
            pick(p);
            e.preventDefault();
          }}
        >
          {#snippet child({ props: itemProps, pressed }: { props: Record<string, unknown>; pressed: boolean })}
            <button {...itemProps} class="ds-position-cell ds-position-{p}" class:ds-position-active={pressed} title={labels[p]} aria-label={labels[p]}>
              <span class="ds-position-dot"></span>
            </button>
          {/snippet}
        </BitsToggleGroup.Item>
      {/each}
    </div>
  {/snippet}
</BitsToggleGroup.Root>

<style>
  /* Cells of 1.5rem: the 24px pointer target. */
  .ds-position-grid { display: inline-grid; grid-template-columns: repeat(3, max(1.5rem, var(--ds-target-min))); gap: 0.25rem; }
  .ds-position-cell {
    display: flex;
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: none;
    cursor: pointer;
    padding: 0.25rem;
    font: inherit;
  }
  .ds-position-cell:not([data-disabled]):hover { background: var(--ds-color-fill-hover); }
  .ds-position-cell:not([data-disabled]):active { background: var(--ds-color-fill-pressed); }
  .ds-position-cell[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* An inset ring: an outward one bleeds into the neighbouring cells. */
  .ds-position-active { border-color: var(--ds-color-accent); outline: var(--ds-focus-ring); outline-offset: var(--ds-focus-ring-offset); }
  .ds-position-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ds-color-fg); }
  .ds-position-active .ds-position-dot { background: var(--ds-color-accent); }
  /* Where each cell's dot sits: where the picture anchors. */
  .ds-position-top-left { justify-content: flex-start; align-items: flex-start; }
  .ds-position-top { justify-content: center; align-items: flex-start; }
  .ds-position-top-right { justify-content: flex-end; align-items: flex-start; }
  .ds-position-left { justify-content: flex-start; align-items: center; }
  .ds-position-center { justify-content: center; align-items: center; }
  .ds-position-right { justify-content: flex-end; align-items: center; }
  .ds-position-bottom-left { justify-content: flex-start; align-items: flex-end; }
  .ds-position-bottom { justify-content: center; align-items: flex-end; }
  .ds-position-bottom-right { justify-content: flex-end; align-items: flex-end; }
</style>
