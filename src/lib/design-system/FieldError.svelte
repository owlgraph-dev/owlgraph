<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The error line under one control (FormField and FieldRow render it from
  // `error`); a control outside them points `aria-describedby` at its `id` and
  // sets `aria-invalid`. A failed action with nothing to fix is an Alert.
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

<p class="ds-field-error {className}" {id}>
  <span class="ds-field-error-icon" aria-hidden="true"><Icon name="alert-circle" size={14} /></span>
  <span>{message}</span>
</p>

<style>
  .ds-field-error {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
    margin: 0;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    line-height: 1.45;
    color: var(--ds-color-danger);
  }
  .ds-field-error-icon { display: inline-flex; flex: none; align-items: center; height: 1.45em; }
</style>
