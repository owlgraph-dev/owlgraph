<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The quick-link icons (icons.ts) in a Popover behind the current glyph. It
  // closes on a pick: an icon is a single choice.
  import Popover from './Popover.svelte';
  import Icon from './Icon.svelte';
  import { QUICK_LINK_ICON_NAMES, iconSvg } from './icons';

  let {
    value = $bindable(null),
    onValueChange,
    icons = QUICK_LINK_ICON_NAMES,
    noneLabel,
    noneTitle,
    ariaLabel,
    open = $bindable(false),
    onOpenChange,
    class: className = '',
  }: {
    value?: string | null;
    onValueChange?: (icon: string | null) => void;
    icons?: string[];
    noneLabel: string;
    noneTitle: string;
    ariaLabel: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    class?: string;
  } = $props();

  function pick(icon: string | null) {
    value = icon;
    onValueChange?.(icon);
    open = false;
    onOpenChange?.(false);
  }
</script>

<span class="ds-iconpick {className}">
  <Popover bind:open {onOpenChange} side="bottom" align="end" triggerProps={{ 'aria-label': ariaLabel, title: ariaLabel }}>
    {#snippet trigger()}
      <span class="ds-iconpick-trigger" class:ds-iconpick-trigger-open={open}>
        {#if value}
          <span class="ds-iconpick-glyph">{@html iconSvg(value, 16)}</span>
        {:else}
          <span class="ds-iconpick-none">∅</span>
          <span class="ds-iconpick-text">{noneLabel}</span>
        {/if}
        <Icon name="chevron" size={12} />
      </span>
    {/snippet}
    <div class="ds-iconpick-grid" role="group" aria-label={ariaLabel}>
      <button type="button" class="ds-iconpick-cell" class:ds-iconpick-cell-active={!value} title={noneTitle} aria-label={noneTitle} aria-pressed={!value} onclick={() => pick(null)}>∅</button>
      {#each icons as ic (ic)}
        <button type="button" class="ds-iconpick-cell" class:ds-iconpick-cell-active={value === ic} title={ic} aria-label={ic} aria-pressed={value === ic} onclick={() => pick(ic)}>{@html iconSvg(ic, 18)}</button>
      {/each}
    </div>
  </Popover>
</span>

<style>
  .ds-iconpick { display: inline-flex; max-width: 100%; }
  .ds-iconpick-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: var(--ds-control-h-sm);
    box-sizing: border-box;
    padding: 0 0.35rem 0 0.4rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-bg);
    color: var(--ds-color-fg);
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
  }
  .ds-iconpick-trigger:hover { border-color: var(--ds-color-border-hover); }
  .ds-iconpick-trigger:active { background: var(--ds-color-fill-hover); border-color: var(--ds-color-border-hover); }
  .ds-iconpick-trigger-open { border-color: var(--ds-color-accent); }
  .ds-iconpick-glyph { display: inline-flex; }
  .ds-iconpick-glyph :global(svg) { display: block; }
  .ds-iconpick-none { color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .ds-iconpick-text { color: var(--ds-color-muted); }
  .ds-iconpick-grid { display: grid; grid-template-columns: repeat(6, max(2rem, var(--ds-target-min))); gap: 0.25rem; padding: 0.2rem; }
  .ds-iconpick-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: max(2rem, var(--ds-target-min));
    height: max(2rem, var(--ds-target-min));
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .ds-iconpick-cell:hover { background: var(--ds-color-fill-hover); }
  .ds-iconpick-cell:active { background: var(--ds-color-fill-pressed); }
  .ds-iconpick-cell-active,
  .ds-iconpick-cell-active:hover { border-color: var(--ds-color-accent); color: var(--ds-color-accent); background: var(--ds-color-accent-soft); }
  .ds-iconpick-cell-active:active { background: var(--ds-color-accent-soft-pressed); }
  .ds-iconpick-cell :global(svg) { display: block; }
</style>
