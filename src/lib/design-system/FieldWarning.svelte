<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // FieldError's sibling for an allowed value with a consequence worth knowing:
  // the control stays valid, so nothing sets aria-invalid.
  import Icon from './Icon.svelte';

  let {
    id,
    message,
    class: className = '',
  }: {
    /** The id the control's aria-describedby names. */
    id: string;
    message: string;
    class?: string;
  } = $props();
</script>

<p class="ds-field-warning {className}" {id}>
  <span class="ds-field-warning-icon" aria-hidden="true"><Icon name="alert-triangle" size={14} /></span>
  <span>{message}</span>
</p>

<style>
  .ds-field-warning {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
    margin: 0;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    line-height: 1.45;
    color: var(--ds-color-warning);
  }
  .ds-field-warning-icon { display: inline-flex; flex: none; align-items: center; height: 1.45em; }
</style>
