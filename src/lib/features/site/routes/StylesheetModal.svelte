<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Initial values are a one-time snapshot: the page remounts this per open.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Alert, FormField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    onOpenChange,
    mode,
    sheet,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'rename';
    sheet: { id: string; name: string } | null;
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'stylesheet-form';
  let name = $state(untrack(() => sheet?.name ?? ''));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_styles_new_title() : m.settings_styles_rename_title());
</script>

<Dialog {open} {onOpenChange} size="sm" {title}>
  <form
    id={formId}
    method="POST"
    action={mode === 'create' ? '?/createSheet' : '?/renameSheet'}
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    {#if mode === 'rename' && sheet}<input type="hidden" name="id" value={sheet.id} />{/if}
    <FormField label={m.settings_styles_name_label()}>
      <Input name="name" bind:value={name} placeholder={m.settings_styles_name_placeholder()} required autofocus />
    </FormField>
    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!name.trim()}>{m.settings_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
