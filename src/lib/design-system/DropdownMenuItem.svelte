<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `href` renders a real <a>, keeping middle-click and open-in-new-tab.
  // `checked` makes a CheckboxItem, announced as a toggle; `active` only marks
  // the current command visually, so never use it for a toggle.
  import { DropdownMenu as BitsDropdownMenu } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    href,
    target,
    rel,
    onSelect,
    disabled = false,
    variant = 'default',
    active = false,
    checked,
    closeOnSelect = true,
    reload = false,
    class: className = '',
    children,
  }: {
    href?: string;
    target?: string;
    rel?: string;
    /** A full navigation (`data-sveltekit-reload`), for a destination under
     * another CSP class than the current page (platform/cspRoutes.ts). */
    reload?: boolean;
    /** For a toggle, flip the consumer's state here; `checked` reflects it back. */
    onSelect?: () => void;
    disabled?: boolean;
    /** `danger` for a destructive command (delete, sign out). */
    variant?: 'default' | 'danger';
    active?: boolean;
    /** An on/off toggle; pair with `closeOnSelect={false}` to flip several. */
    checked?: boolean;
    closeOnSelect?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();

  const itemClass = $derived(`ds-menu-item ${variant === 'danger' ? 'ds-menu-item-danger' : ''} ${active ? 'ds-menu-item-active' : ''} ${className}`);
</script>

{#if checked !== undefined}
  <BitsDropdownMenu.CheckboxItem {disabled} {closeOnSelect} {onSelect} {checked} class="{itemClass} ds-menu-item-checkable">
    {#snippet child({ props, checked: on }: { props: Record<string, unknown>; checked: boolean })}
      <div {...props}>
        <span class="ds-menu-item-check" aria-hidden="true">{#if on}<Icon name="check" size={14} />{/if}</span>
        {@render children?.()}
      </div>
    {/snippet}
  </BitsDropdownMenu.CheckboxItem>
{:else}
  <BitsDropdownMenu.Item {disabled} {closeOnSelect} {onSelect} class={itemClass}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      {#if href}
        <a {href} {target} {rel} data-sveltekit-reload={reload ? '' : undefined} {...props}>
          {@render children?.()}
        </a>
      {:else}
        <div {...props}>
          {@render children?.()}
        </div>
      {/if}
    {/snippet}
  </BitsDropdownMenu.Item>
{/if}

<style>
  /* Not :global(): Bits UI merges `class` onto this template's own <a>/<div>
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-menu-item {
    display: block;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    border: 0;
    background: none;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
    /* A block, so the row grows to --ds-target-min on touch through padding. */
    padding: max(0.45rem, calc((var(--ds-target-min) - 1lh) / 2)) 0.55rem;
    border-radius: var(--ds-radius-sm);
    cursor: pointer;
    text-decoration: none;
  }
  .ds-menu-item[data-highlighted] { background: var(--ds-color-fill-hover); }
  .ds-menu-item[data-highlighted]:not([data-disabled]):active { background: var(--ds-color-fill-pressed); }
  .ds-menu-item[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-menu-item-danger { color: var(--ds-color-danger); }
  .ds-menu-item-active { color: var(--ds-color-accent); background: var(--ds-color-accent-soft); }
  /* Keeps its ground while highlighted: accent text on the grey highlight is
     4.2:1, under the text minimum. */
  .ds-menu-item-active[data-highlighted] { background: var(--ds-color-accent-soft); }
  .ds-menu-item-active[data-highlighted]:not([data-disabled]):active { background: var(--ds-color-accent-soft-pressed); }
  .ds-menu-item-checkable { display: flex; align-items: center; gap: 0.4rem; }
  .ds-menu-item-check { display: inline-flex; flex: none; width: 1rem; color: var(--ds-color-accent); }
</style>
