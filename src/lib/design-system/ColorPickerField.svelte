<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // ColorField in a Popover behind a swatch-and-value trigger, for a narrow
  // panel. It stays open after a pick, so candidates compare in place.
  import Popover from './Popover.svelte';
  import ColorField from './ColorField.svelte';
  import Icon from './Icon.svelte';

  let {
    value = $bindable(null),
    onValueChange,
    swatches,
    resolved = null,
    noneLabel,
    noneTitle,
    customTitle,
    ariaLabel,
    open = $bindable(false),
    onOpenChange,
    themeColors,
    themeLabel,
    customLabel,
    custom = true,
    class: className = '',
  }: {
    value?: string | null;
    onValueChange?: (color: string | null) => void;
    swatches: string[];
    /** The effective colour when `value` is unset (default or inherited), shown muted. */
    resolved?: string | null;
    noneLabel: string;
    noneTitle: string;
    customTitle: string;
    ariaLabel: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Passed to ColorField: colours that follow the scheme; a stored one shows by name. */
    themeColors?: { value: string; label: string; css: string }[];
    themeLabel?: string;
    customLabel?: string;
    /** Passed to ColorField: false offers the theme colours only. */
    custom?: boolean;
    class?: string;
  } = $props();

  const shown = $derived(value ?? resolved ?? null);
  const themeOf = (v: string | null) => (v ? themeColors?.find((t) => t.value === v) : undefined);
  const shownPaint = $derived(themeOf(shown)?.css ?? shown);
  const valueText = $derived(value ? (themeOf(value)?.label ?? value) : noneLabel);
</script>

<span class="ds-colorpick {className}">
  <Popover bind:open {onOpenChange} side="bottom" align="end" triggerProps={{ 'aria-label': ariaLabel, title: ariaLabel }}>
    {#snippet trigger()}
      <span class="ds-colorpick-trigger" class:ds-colorpick-trigger-open={open}>
        <span
          class="ds-colorpick-swatch"
          class:ds-colorpick-swatch-none={!shown}
          class:ds-colorpick-swatch-inherited={!value && !!resolved}
          style={shownPaint ? `background:${shownPaint}` : undefined}
        ></span>
        <span class="ds-colorpick-text" class:ds-colorpick-text-none={!value}>{valueText}</span>
        <Icon name="chevron" size={12} />
      </span>
    {/snippet}
    <div class="ds-colorpick-panel">
      <ColorField bind:value {onValueChange} {swatches} {noneTitle} {customTitle} {themeColors} {themeLabel} {customLabel} {custom} />
    </div>
  </Popover>
</span>

<style>
  .ds-colorpick { display: inline-flex; max-width: 100%; }
  .ds-colorpick-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: var(--ds-control-h-sm);
    box-sizing: border-box;
    padding: 0 0.35rem 0 0.3rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-bg);
    color: var(--ds-color-fg);
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    max-width: 100%;
  }
  .ds-colorpick-trigger:hover { border-color: var(--ds-color-border-hover); }
  .ds-colorpick-trigger:active { background: var(--ds-color-fill-hover); border-color: var(--ds-color-border-hover); }
  .ds-colorpick-trigger-open { border-color: var(--ds-color-accent); }
  .ds-colorpick-swatch {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 1px solid var(--ds-color-border);
    box-sizing: border-box;
  }
  .ds-colorpick-swatch-none {
    background: repeating-linear-gradient(45deg, transparent 0 3px, var(--ds-color-border) 3px 4px);
  }
  .ds-colorpick-swatch-inherited { opacity: 0.55; }
  .ds-colorpick-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .ds-colorpick-text-none { color: var(--ds-color-muted); }
  .ds-colorpick-panel { padding: 0.3rem; max-width: 220px; }
</style>
