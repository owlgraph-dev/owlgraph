<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `loading` keeps the button's width and name and disables it (no double
  // submit) without the disabled dimming: a working button is not unavailable.
  import type { Snippet } from 'svelte';
  import Spinner from './Spinner.svelte';

  let {
    variant = 'secondary',
    size = 'md',
    icon = false,
    active = false,
    disabled = false,
    loading = false,
    type = 'button',
    href,
    class: className = '',
    children,
    ...rest
  }: {
    /** `link` is a text action in running content or under a field: accent,
     * underlined, no box and no fixed height. */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-danger' | 'link';
    size?: 'sm' | 'md' | 'lg';
    /** Square icon-only sizing. */
    icon?: boolean;
    /** Pressed/open state (a toggle whose panel is open), with any `variant`. */
    active?: boolean;
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
    /** Renders an <a> instead of a <button> when set. */
    href?: string;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const isDisabled = $derived(disabled || loading);
  const spinnerSize = $derived(size === 'sm' ? 14 : size === 'lg' ? 18 : 16);
</script>

{#if href}
  <a
    {href}
    class="ds-btn ds-btn-{variant} ds-btn-{size} {className}"
    class:ds-btn-icon={icon}
    class:ds-btn-active={active}
    class:ds-btn-loading={loading}
    aria-disabled={isDisabled || undefined}
    aria-busy={loading || undefined}
    {...rest}
  >
    <span class="ds-btn-label">{@render children?.()}</span>
    {#if loading}<span class="ds-btn-spinner"><Spinner size={spinnerSize} /></span>{/if}
  </a>
{:else}
  <button
    {type}
    disabled={isDisabled}
    class="ds-btn ds-btn-{variant} ds-btn-{size} {className}"
    class:ds-btn-icon={icon}
    class:ds-btn-active={active}
    class:ds-btn-loading={loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    <span class="ds-btn-label">{@render children?.()}</span>
    {#if loading}<span class="ds-btn-spinner"><Spinner size={spinnerSize} /></span>{/if}
  </button>
{/if}

<style>
  .ds-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-weight: var(--ds-weight-medium);
    border-radius: var(--ds-radius-sm);
    border: 1px solid var(--ds-color-border);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    /* A short label's button is still a 44px target on touch. */
    min-width: var(--ds-target-min);
  }
  /* Only an enabled control hovers; the filled variants keep their own border. */
  .ds-btn-secondary:not(:disabled):not([aria-disabled='true']):hover,
  .ds-btn-ghost:not(:disabled):not([aria-disabled='true']):hover { border-color: var(--ds-color-border-hover); }
  .ds-btn:disabled,
  .ds-btn[aria-disabled='true'] { opacity: var(--ds-opacity-disabled); cursor: default; }

  /* While loading, the label is a box at opacity 0: the width stays and, unlike
     visibility: hidden, the label stays the button's accessible name. */
  .ds-btn-label { display: contents; }
  .ds-btn-loading .ds-btn-label { display: inline-flex; align-items: center; gap: inherit; opacity: 0; }
  .ds-btn-spinner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .ds-btn.ds-btn-loading { opacity: 1; cursor: progress; }

  .ds-btn-sm { height: var(--ds-control-h-sm); padding: 0 var(--ds-space-sm); font-size: var(--ds-text-sm); }
  .ds-btn-md { height: var(--ds-control-h-md); padding: 0 0.7rem; font-size: var(--ds-text-md); }
  .ds-btn-lg { height: var(--ds-control-h-lg); padding: 0 var(--ds-space-md); font-size: var(--ds-text-lg); }
  .ds-btn-icon.ds-btn-sm { width: var(--ds-control-h-sm); padding: 0; }
  .ds-btn-icon.ds-btn-md { width: var(--ds-control-h-md); padding: 0; }
  .ds-btn-icon.ds-btn-lg { width: var(--ds-control-h-lg); padding: 0; }

  .ds-btn-secondary { background: var(--ds-color-raised); color: var(--ds-color-fg); }
  /* The filled variants recolour the global focus ring for their subtree: an
     accent ring on an accent fill would be 1:1. */
  .ds-btn-primary,
  .ds-btn-danger { --ds-focus-ring-color: var(--ds-color-on-accent); --ds-focus-ring-offset: var(--ds-focus-ring-offset-filled); }
  .ds-btn-primary { background: var(--ds-color-accent); color: var(--ds-color-on-accent); border-color: var(--ds-color-accent); }
  .ds-btn-ghost { background: none; border-color: transparent; color: var(--ds-color-fg); }
  .ds-btn-ghost:not(:disabled):not([aria-disabled='true']):hover { background: var(--ds-color-fill-hover); }
  .ds-btn-danger { background: var(--ds-color-danger); color: var(--ds-color-on-accent); border-color: var(--ds-color-danger); }
  /* A quiet destructive action for repeated per-row use; the filled `danger`
     is for a one-off confirm. */
  .ds-btn-ghost-danger { background: none; border-color: transparent; color: var(--ds-color-danger); }
  .ds-btn-ghost-danger:not(:disabled):not([aria-disabled='true']):hover { background: var(--ds-color-danger-soft); border-color: transparent; }
  /* The box collapses to the text; the size sets only the text size. */
  .ds-btn.ds-btn-link { height: auto; min-height: var(--ds-target-min); padding: 0; border-color: transparent; background: none; color: var(--ds-color-accent); font-weight: var(--ds-weight-normal); text-decoration: underline; text-underline-offset: 0.15em; white-space: normal; text-align: left; }
  .ds-btn-link:not(:disabled):not([aria-disabled='true']):hover { color: var(--ds-color-accent-hover); }
  .ds-btn-link:not(:disabled):not([aria-disabled='true']):active { color: var(--ds-color-accent-pressed); }

  /* The :hover rule keeps the active look: the variant's own hover would win on
     specificity (docs/architecture/design-system/primitives.md#primitive-api-convention). */
  .ds-btn-active { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-color: transparent; --ds-focus-ring-color: var(--ds-color-accent); --ds-focus-ring-offset: calc(-1 * var(--ds-focus-ring-width)); }
  .ds-btn-active:not(:disabled):not([aria-disabled='true']):hover { background: var(--ds-color-accent-soft); border-color: transparent; }

  /* Listed after the hover and active rules they must win over. */
  .ds-btn-primary:not(:disabled):not([aria-disabled='true']):hover { background: var(--ds-color-accent-hover); border-color: var(--ds-color-accent-hover); }
  .ds-btn-danger:not(:disabled):not([aria-disabled='true']):hover { background: var(--ds-color-danger-hover); border-color: var(--ds-color-danger-hover); }
  .ds-btn-primary:not(:disabled):not([aria-disabled='true']):active { background: var(--ds-color-accent-pressed); border-color: var(--ds-color-accent-pressed); }
  .ds-btn-danger:not(:disabled):not([aria-disabled='true']):active { background: var(--ds-color-danger-pressed); border-color: var(--ds-color-danger-pressed); }
  .ds-btn-secondary:not(:disabled):not([aria-disabled='true']):active { background: var(--ds-color-fill-hover); border-color: var(--ds-color-border-hover); }
  .ds-btn-ghost:not(:disabled):not([aria-disabled='true']):active { background: var(--ds-color-fill-pressed); }
  .ds-btn-ghost-danger:not(:disabled):not([aria-disabled='true']):active { background: var(--ds-color-danger-soft-pressed); }
  .ds-btn-active:not(:disabled):not([aria-disabled='true']):active { background: var(--ds-color-accent-soft-pressed); }
</style>
