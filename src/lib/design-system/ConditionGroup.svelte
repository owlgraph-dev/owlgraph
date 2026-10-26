<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A rule builder's group: the combinator, the members, an optional footer.
  // The consumer renders members and nested groups into `children`; a nested
  // group (`depth` ≥ 1) is an indented block with a left rule.
  import type { Snippet } from 'svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SegmentedControlItem from './SegmentedControlItem.svelte';

  let {
    combinator,
    onCombinatorChange,
    allLabel,
    anyLabel,
    showCombinator = true,
    depth = 0,
    label,
    combinatorAriaLabel,
    class: className = '',
    children,
    actions,
    footer,
  }: {
    combinator: 'and' | 'or';
    onCombinatorChange: (combinator: 'and' | 'or') => void;
    /** Label of the AND choice ("all conditions match"). */
    allLabel: string;
    /** Label of the OR choice ("any condition matches"). */
    anyLabel: string;
    /** Names the group in its header, so it reads as what it is while empty. */
    label?: string;
    /** Hide the combinator (fewer than two members); the header row stays. */
    showCombinator?: boolean;
    depth?: number;
    combinatorAriaLabel?: string;
    class?: string;
    children?: Snippet;
    /** Header-right actions (e.g. remove this nested group). */
    actions?: Snippet;
    /** Below the members (e.g. the add buttons). */
    footer?: Snippet;
  } = $props();
</script>

<div class="ds-condition-group {className}" class:ds-condition-group--nested={depth > 0} data-depth={depth}>
  {#if showCombinator || actions || label}
    <div class="ds-condition-group-head">
      {#if label}
        <span class="ds-condition-group-label">{label}</span>
      {/if}
      {#if showCombinator}
        <SegmentedControl value={combinator} ariaLabel={combinatorAriaLabel}>
          <SegmentedControlItem value="and" onclick={() => onCombinatorChange('and')}>{allLabel}</SegmentedControlItem>
          <SegmentedControlItem value="or" onclick={() => onCombinatorChange('or')}>{anyLabel}</SegmentedControlItem>
        </SegmentedControl>
      {/if}
      {#if actions}
        <div class="ds-condition-group-actions">{@render actions()}</div>
      {/if}
    </div>
  {/if}
  <div class="ds-condition-group-body">
    {@render children?.()}
  </div>
  {#if footer}
    <div class="ds-condition-group-foot">{@render footer()}</div>
  {/if}
</div>

<style>
  .ds-condition-group {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
    min-width: 0;
    font-family: var(--ds-font-sans);
  }
  /* Stepped in, with a left rule as the tree's branch line. */
  .ds-condition-group--nested {
    padding: var(--ds-space-sm) var(--ds-space-sm) var(--ds-space-sm) 0.75rem;
    border-left: 2px solid var(--ds-color-border);
    border-radius: 0 var(--ds-radius-sm) var(--ds-radius-sm) 0;
    background: color-mix(in srgb, var(--ds-color-border) 22%, transparent);
  }
  .ds-condition-group-head {
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    min-height: var(--ds-control-h-md);
  }
  .ds-condition-group-label {
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-muted);
  }
  .ds-condition-group-actions { display: inline-flex; align-items: center; gap: 0.25rem; margin-left: auto; }
  .ds-condition-group-body {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }
  .ds-condition-group-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
</style>
