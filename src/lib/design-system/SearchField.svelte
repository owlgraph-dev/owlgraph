<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A search term with its submit inside one framed control, so the field can
  // take a phone row's whole width. The frame draws the ring through :has(),
  // not :focus-within: the submit rings itself.
  import Icon from './Icon.svelte';
  import { getFormFieldContext } from './formField';

  let {
    value = $bindable(''),
    name,
    placeholder,
    ariaLabel,
    submitLabel,
    disabled = false,
    class: className = '',
    ...rest
  }: {
    value?: string;
    /** Posts the term as a form field with this name, from the input itself. */
    name?: string;
    placeholder?: string;
    /** The field's accessible name. */
    ariaLabel?: string;
    /** The submit button's accessible name and tooltip ("Search"). */
    submitLabel: string;
    disabled?: boolean;
    class?: string;
    [key: string]: unknown;
  } = $props();

  const field = getFormFieldContext();
</script>

<div class="ds-searchfield {className}" class:ds-searchfield--disabled={disabled}>
  <input
    type="search"
    class="ds-searchfield-input"
    bind:value
    {name}
    {placeholder}
    {disabled}
    aria-label={ariaLabel}
    id={field?.controlId}
    aria-describedby={field?.describedBy}
    {...rest}
  />
  <button type="submit" class="ds-searchfield-submit" aria-label={submitLabel} title={submitLabel} {disabled}>
    <Icon name="search" size={18} />
  </button>
</div>

<style>
  .ds-searchfield {
    display: flex;
    align-items: stretch;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: var(--ds-control-h-md);
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    font-family: var(--ds-font-sans);
  }
  .ds-searchfield:not(.ds-searchfield--disabled):hover { border-color: var(--ds-color-border-hover); }
  .ds-searchfield--disabled { opacity: var(--ds-opacity-disabled); }
  .ds-searchfield:has(.ds-searchfield-input:focus-visible) {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-searchfield-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 0.6rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--ds-text-field-md);
    color: var(--ds-color-fg);
  }
  /* The frame above rings for the input. */
  .ds-searchfield-input:focus-visible { outline: none; }
  .ds-searchfield-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--ds-control-h-md);
    padding: 0;
    border: 0;
    border-radius: 0 var(--ds-radius-sm) var(--ds-radius-sm) 0;
    background: none;
    color: var(--ds-color-muted);
    font: inherit;
    cursor: pointer;
  }
  .ds-searchfield-submit:not(:disabled):hover { color: var(--ds-color-fg); background: var(--ds-color-fill-hover); }
  .ds-searchfield-submit:not(:disabled):active { background: var(--ds-color-fill-pressed); }
  .ds-searchfield-submit:disabled { cursor: default; }
</style>
