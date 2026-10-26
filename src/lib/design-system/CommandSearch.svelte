<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A Command's framed search field. Escape on a typed term clears it and stops;
  // on an empty field it reaches the layer around, which closes. The frame draws
  // the ring through :has(), not :focus-within: the clear button rings itself.
  import { Command as BitsCommand } from 'bits-ui';
  import Icon from './Icon.svelte';
  import { getCommandContext } from './command';

  let {
    value = $bindable(''),
    onValueChange,
    placeholder,
    clearLabel,
    size = 'md',
    autofocus = false,
    class: className = '',
  }: {
    value?: string;
    /** Every change: typed, or cleared by the button or by Escape. */
    onValueChange?: (value: string) => void;
    placeholder?: string;
    /** The clear button's translated name and tooltip. */
    clearLabel: string;
    size?: 'md' | 'lg';
    autofocus?: boolean;
    class?: string;
  } = $props();

  const command = getCommandContext();
  let input = $state<HTMLInputElement | null>(null);

  function set(next: string) {
    value = next;
    onValueChange?.(next);
  }

  function clear() {
    set('');
    input?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || value === '' || e.isComposing) return;
    // Bits UI's layers listen on the document: stopping here keeps the
    // dialog or popover open for this Escape.
    e.stopPropagation();
    e.preventDefault();
    set('');
  }
</script>

<div class="ds-command-search ds-command-search-{size} {className}">
  <span class="ds-command-search-glyph"><Icon name="search" size={size === 'lg' ? 18 : 16} /></span>
  <BitsCommand.Input bind:value {autofocus}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <!-- bind:value here too: with `child`, Bits UI's own <input> never mounts.
           aria-controls after the spread: the listbox, not the viewport, and
           nothing (collapsed) while no list is mounted. -->
      <input
        {...props}
        bind:this={input}
        bind:value
        {placeholder}
        aria-expanded={command?.listed ? 'true' : 'false'}
        aria-controls={command?.listed ? command.listId : undefined}
        class="ds-command-search-input"
        oninput={(e) => onValueChange?.(e.currentTarget.value)}
        {onkeydown}
      />
    {/snippet}
  </BitsCommand.Input>
  {#if value !== ''}
    <button type="button" class="ds-command-search-clear" aria-label={clearLabel} title={clearLabel} onclick={clear}>
      <Icon name="x" size={16} />
    </button>
  {/if}
</div>

<style>
  .ds-command-search {
    display: flex;
    align-items: stretch;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    font-family: var(--ds-font-sans);
    color: var(--ds-color-muted);
  }
  .ds-command-search-md { height: var(--ds-control-h-md); }
  .ds-command-search-lg { height: var(--ds-control-h-lg); }
  .ds-command-search:hover { border-color: var(--ds-color-border-hover); }
  .ds-command-search:has(.ds-command-search-input:focus-visible) {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-command-search-glyph {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 0 var(--ds-space-sm);
  }
  .ds-command-search-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--ds-text-field-md);
    color: var(--ds-color-fg);
  }
  /* The frame above rings for the field. */
  .ds-command-search-input:focus-visible { outline: none; }
  /* Room at the end while there is nothing to clear. */
  .ds-command-search-input:last-child { padding-inline-end: var(--ds-space-sm); }
  .ds-command-search-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 0 var(--ds-radius-sm) var(--ds-radius-sm) 0;
    background: none;
    color: var(--ds-color-muted);
    font: inherit;
    cursor: pointer;
  }
  .ds-command-search-md .ds-command-search-clear { width: var(--ds-control-h-md); }
  .ds-command-search-lg .ds-command-search-clear { width: var(--ds-control-h-lg); }
  .ds-command-search-clear:hover { color: var(--ds-color-fg); background: var(--ds-color-fill-hover); }
  .ds-command-search-clear:active { background: var(--ds-color-fill-pressed); }
</style>
