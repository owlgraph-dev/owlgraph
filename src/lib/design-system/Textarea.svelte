<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { getFormFieldContext } from './formField';

  let {
    value = $bindable(''),
    disabled = false,
    placeholder,
    rows = 4,
    class: className = '',
    ...rest
  }: {
    value?: string;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    class?: string;
    [key: string]: unknown;
  } = $props();

  const field = getFormFieldContext();
</script>

<textarea
  bind:value
  {disabled}
  {placeholder}
  {rows}
  id={field?.controlId}
  aria-describedby={field?.describedBy}
  aria-invalid={field?.invalid ? 'true' : undefined}
  class="ds-textarea {className}"
  {...rest}
></textarea>

<style>
  .ds-textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem 0.6rem;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-field-md);
    color: var(--ds-color-fg);
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    resize: vertical;
  }
  .ds-textarea:not(:disabled):not([aria-invalid='true']):hover { border-color: var(--ds-color-border-hover); }
  .ds-textarea:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-textarea[aria-invalid='true'] { border-color: var(--ds-color-danger); }
</style>
