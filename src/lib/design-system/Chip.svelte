<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A chosen value as a pill with an optional remove button; a static label is
  // a Badge. The remove button is a 24px target (WCAG 2.5.8) that never takes
  // focus from a text entry beside it on mouse down.
  import Icon from './Icon.svelte';

  let {
    label,
    removeLabel,
    onRemove,
    size = 'sm',
    class: className = '',
  }: {
    label: string;
    /** The translated "Remove"; with `onRemove`, renders the remove button. */
    removeLabel?: string;
    onRemove?: () => void;
    /** `sm` inside a field or popover; `md` on a touch sheet. */
    size?: 'sm' | 'md';
    class?: string;
  } = $props();
</script>

<span class="ds-chip ds-chip-{size} {className}">
  <span class="ds-chip-label">{label}</span>
  {#if onRemove && removeLabel}
    <button
      type="button"
      class="ds-chip-remove"
      title={removeLabel}
      aria-label="{removeLabel}: {label}"
      onmousedown={(e) => e.preventDefault()}
      onclick={onRemove}
    >
      <Icon name="x" size={12} />
    </button>
  {/if}
</span>

<style>
  .ds-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    max-width: 100%;
    padding: 0.1rem 0.3rem 0.1rem 0.55rem;
    border-radius: var(--ds-radius-pill);
    background: var(--ds-color-accent-soft);
    color: var(--ds-color-accent);
    font-family: var(--ds-font-sans);
    line-height: 1.4;
  }
  .ds-chip-sm { font-size: var(--ds-text-sm); }
  .ds-chip-md { font-size: var(--ds-text-md); padding: 0.2rem 0.35rem 0.2rem 0.7rem; }
  .ds-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ds-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: max(1.5rem, var(--ds-target-min));
    height: max(1.5rem, var(--ds-target-min));
    margin: -0.3rem -0.25rem -0.3rem -0.1rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
  }
  .ds-chip-remove:hover { opacity: 1; background: color-mix(in srgb, currentColor 14%, transparent); }
  .ds-chip-remove:active { opacity: 1; background: color-mix(in srgb, currentColor 26%, transparent); }
  .ds-chip-remove:focus-visible { opacity: 1; }
</style>
