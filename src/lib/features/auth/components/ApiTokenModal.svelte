<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The page shows the raw token afterwards (form.created), once.
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, FormField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    onOpenChange,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
  } = $props();

  const formId = 'api-token-form';
  let name = $state('');
</script>

<Dialog {open} {onOpenChange} size="sm" title={m.settings_api_tokens_add()}>
  <form
    id={formId}
    method="POST"
    action="?/create"
    use:enhance={() => async ({ result, update }) => {
      await update({ reset: true });
      if (result.type === 'success') onSaved();
    }}
  >
    <FormField label={m.settings_api_tokens_name_label()}><Input name="name" bind:value={name} placeholder={m.settings_api_tokens_name_placeholder()} autocomplete="off" autofocus /></FormField>
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!name.trim()}>{m.settings_api_tokens_create()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
</style>
