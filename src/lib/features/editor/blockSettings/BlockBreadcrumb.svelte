<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The block settings panel's one-line path to the selection; ancestors above the last
  // two collapse into a "…" menu, so the path never wraps.
  import * as m from '$lib/paraglide/messages';
  import type { SelectionChainEntry } from '$lib/features/content/editor';
  import { Button, DropdownMenu, DropdownMenuItem, TriggerFace } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { splitCrumbs } from './sections';
  import { labelFor } from './blockLabels';

  let { chain, selectedIndex, onSelect, onOverlayOpenChange }: {
    chain: SelectionChainEntry[];
    selectedIndex: number;
    onSelect: (i: number) => void;
    /** The "…" menu's open state, for the editor's Escape handling. */
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  // Each crumb keeps its chain index so a click selects the right ancestor.
  const path = $derived(chain.slice(0, selectedIndex + 1).map((entry, i) => ({ entry, i })));
  const split = $derived(splitCrumbs(path));

  let moreOpen = $state(false);
</script>

<nav class="crumb" aria-label={m.editor_breadcrumb_aria()}>
  <Button
    variant="ghost"
    size="sm"
    icon
    disabled={selectedIndex <= 0}
    aria-label={m.editor_breadcrumb_select_parent()}
    title={m.editor_breadcrumb_select_parent()}
    onclick={() => onSelect(selectedIndex - 1)}
  ><Icon name="arrow-up" size={15} /></Button>
  {#if split.hidden.length > 0}
    <DropdownMenu
      bind:open={moreOpen}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
      align="start"
      ariaLabel={m.editor_breadcrumb_more()}
      triggerProps={{ 'aria-label': m.editor_breadcrumb_more(), title: m.editor_breadcrumb_more() }}
    >
      {#snippet trigger()}
        <TriggerFace variant="toolbar" size="sm" icon><Icon name="more" size={14} /></TriggerFace>
      {/snippet}
      {#each split.hidden as { entry, i } (entry.pos)}
        <DropdownMenuItem onSelect={() => onSelect(i)}>{labelFor(entry.type)}</DropdownMenuItem>
      {/each}
    </DropdownMenu>
    <span class="crumb-sep" aria-hidden="true">›</span>
  {/if}
  {#each split.visible as { entry, i }, k (entry.pos)}
    {#if k > 0}<span class="crumb-sep" aria-hidden="true">›</span>{/if}
    <!-- ui-check-allow: raw-element — a breadcrumb segment: text that truncates with an ellipsis inside a nav, which Button's no-wrap box can't do -->
    <button
      type="button"
      class="crumb-btn"
      class:crumb-parent={k === 0 && split.visible.length > 1}
      class:active={i === selectedIndex}
      aria-current={i === selectedIndex ? 'true' : undefined}
      onclick={() => onSelect(i)}
    >
      {labelFor(entry.type)}
    </button>
  {/each}
</nav>

<style>
  .crumb { display: flex; align-items: center; flex-wrap: nowrap; gap: 0.1rem; min-width: 0; margin: 0 0 0.35rem; }
  .crumb-btn {
    flex: 0 1 auto;
    min-width: max(2.5rem, var(--ds-target-min));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    background: none;
    color: var(--ds-color-muted);
    cursor: pointer;
    font: inherit;
    font-size: var(--ds-text-xs);
    font-weight: var(--ds-weight-semibold);
    min-height: max(1.5rem, var(--ds-target-min));
    padding: 0.2rem 0.35rem;
    border-radius: var(--ds-radius-sm);
  }
  .crumb-parent { max-width: 45%; }
  .crumb-btn:hover { background: var(--ds-color-fill-hover); color: var(--ds-color-fg); }
  .crumb-btn:active { background: var(--ds-color-fill-pressed); }
  .crumb-btn.active { background: var(--ds-color-accent); color: var(--ds-color-on-accent); --ds-focus-ring-color: var(--ds-color-on-accent); --ds-focus-ring-offset: var(--ds-focus-ring-offset-filled); }
  .crumb-sep { flex: none; color: var(--ds-color-muted); font-size: 0.75rem; }</style>
