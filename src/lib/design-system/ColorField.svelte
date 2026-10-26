<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Only the swatch group; the row label stays with the caller. A swatch can be
  // any colour, so the selected one's check sits on a bg disc and focus adds the
  // two-tone band (docs/architecture/design-system/tokens.md, "Focus and selection rings").
  import Icon from './Icon.svelte';

  let {
    value = $bindable(null),
    onValueChange,
    swatches,
    noneTitle,
    customTitle,
    mixed = false,
    custom = true,
    themeColors,
    themeLabel,
    customLabel,
    class: className = '',
  }: {
    value?: string | null;
    onValueChange?: (color: string | null) => void;
    /** The swatches to offer; the consumer owns the vocabulary. */
    swatches: string[];
    noneTitle: string;
    customTitle: string;
    /** Whether the swatches and the free picker are offered; false leaves the theme colours alone. */
    custom?: boolean;
    /** Colours that follow the scheme (docs/architecture/theming.md, "Colour references"), a
     * labelled group shown first: `value` is stored, `css` paints the swatch. */
    themeColors?: { value: string; label: string; css: string }[];
    /** Names the theme group (visible, and the group's accessible name). */
    themeLabel?: string;
    /** Names the custom group when a theme group is shown. */
    customLabel?: string;
    /** Shows no swatch active (a selection of differing colours), keeping `value`. */
    mixed?: boolean;
    class?: string;
  } = $props();

  const noneSelected = $derived(!mixed && !value);

  function pick(color: string | null) {
    value = color;
    onValueChange?.(color);
  }
</script>

{#snippet none()}
  <button
    type="button"
    class="ds-color-sw ds-color-sw-none"
    title={noneTitle}
    aria-label={noneTitle}
    aria-pressed={noneSelected}
    onclick={() => pick(null)}
  >
    {#if noneSelected}
      <span class="ds-color-sw-check" aria-hidden="true"><Icon name="check" size={12} /></span>
    {:else}
      <span aria-hidden="true">∅</span>
    {/if}
  </button>
{/snippet}

{#snippet swatch(stored: string, paint: string, name: string)}
  {@const selected = !mixed && value === stored}
  <button
    type="button"
    class="ds-color-sw"
    style="background:{paint}"
    title={name}
    aria-label={name}
    aria-pressed={selected}
    onclick={() => pick(stored)}
  >
    {#if selected}<span class="ds-color-sw-check" aria-hidden="true"><Icon name="check" size={12} /></span>{/if}
  </button>
{/snippet}

{#snippet customGroup()}
  {#each swatches as c (c)}
    {@render swatch(c, c, c)}
  {/each}
  <input
    class="ds-color-sw ds-color-sw-custom"
    type="color"
    value={value && value.startsWith('#') ? value : '#000000'}
    title={customTitle}
    aria-label={customTitle}
    oninput={(e) => pick(e.currentTarget.value)}
  />
{/snippet}

{#if themeColors?.length}
  <div class="ds-color-field ds-color-field-grouped {className}">
    <div class="ds-color-group" role="group" aria-label={themeLabel}>
      {#if themeLabel}<span class="ds-color-group-label" aria-hidden="true">{themeLabel}</span>{/if}
      <div class="ds-color-row">
        {@render none()}
        {#each themeColors as t (t.value)}
          {@render swatch(t.value, t.css, t.label)}
        {/each}
      </div>
    </div>
    {#if custom}
      <div class="ds-color-group" role="group" aria-label={customLabel}>
        {#if customLabel}<span class="ds-color-group-label" aria-hidden="true">{customLabel}</span>{/if}
        <div class="ds-color-row">{@render customGroup()}</div>
      </div>
    {/if}
  </div>
{:else}
  <div class="ds-color-field {className}">
    {@render none()}
    {#if custom}{@render customGroup()}{/if}
  </div>
{/if}

<style>
  .ds-color-field { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
  .ds-color-field-grouped { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: var(--ds-space-sm); }
  .ds-color-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .ds-color-group-label { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .ds-color-row { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
  .ds-color-sw {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: max(1.5rem, var(--ds-target-min));
    height: max(1.5rem, var(--ds-target-min));
    padding: 0;
    border: 1px solid var(--ds-color-border);
    border-radius: 50%;
    cursor: pointer;
  }
  /* Two tones far apart (fg and bg), so one always reaches 3:1 on any swatch;
     the accent fails on a mid-tone fill. */
  .ds-color-sw:focus-visible {
    outline: var(--ds-focus-ring-width) solid var(--ds-color-fg);
    outline-offset: var(--ds-focus-ring-offset);
    box-shadow: var(--ds-focus-ring-companion);
  }
  /* The fill is the value, so hover and pressed shift it with a filter. */
  .ds-color-sw:hover { filter: var(--ds-filter-content-hover); border-color: var(--ds-color-border-hover); }
  .ds-color-sw:active { filter: var(--ds-filter-content-pressed); border-color: var(--ds-color-border-strong); }
  .ds-color-sw-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 50%;
    background: var(--ds-color-bg);
    color: var(--ds-color-fg);
  }
  .ds-color-sw-none { background: var(--ds-color-bg); color: var(--ds-color-muted); font-size: var(--ds-text-xs); }
</style>
