<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Name only: variants are uploaded on the family's card afterwards.
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Alert, FormField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    onOpenChange,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'font-family-form';
  let name = $state('');
  let submitted = $state(false);
</script>

<Dialog {open} {onOpenChange} size="sm" title={m.settings_fonts_add_family()}>
  <form
    id={formId}
    method="POST"
    action="?/createFamily"
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update();
        if (result.type === 'success') onSaved();
      };
    }}
  >
    <FormField label={m.settings_fonts_new_family_label()}><Input name="name" bind:value={name} placeholder={m.settings_fonts_new_family_placeholder()} required autofocus /></FormField>
    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!name.trim()}>{m.settings_fonts_add_family()}</Button>
  {/snippet}
</Dialog>

<style>
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
