<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The key is the identity: editing it saves a new group.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Alert, FormField } from '$lib/design-system';
  import LocalizedField from '../components/LocalizedField.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { LocalizedText } from '$lib/platform/i18n/localizedText';
  import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';

  type Row = { slug: string; label: LocalizedText; description: LocalizedText };

  let {
    open,
    onOpenChange,
    mode,
    row,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    row: Row | null;
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'property-group-form';
  let slug = $state(untrack(() => row?.slug ?? ''));
  let label = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.label })));
  let description = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.description })));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_schema_groups_add_heading() : m.settings_schema_groups_update_heading());
  const canSave = $derived(!!slug.trim() && !!label[siteDefaultLocale()]?.trim());
</script>

<Dialog {open} {onOpenChange} size="md" {title}>
  <form
    id={formId}
    method="POST"
    action="?/save"
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    <FormField label={m.settings_schema_groups_slug_field()}><Input name="slug" bind:value={slug} placeholder={m.settings_schema_groups_slug_placeholder()} required autofocus /></FormField>
    <LocalizedField label={m.settings_schema_groups_label_field()} name="label" required bind:value={label} placeholder={m.settings_schema_groups_label_placeholder()} />
    <LocalizedField label={m.settings_schema_groups_description_field()} name="description" multiline bind:value={description} placeholder={m.settings_schema_groups_description_placeholder()} />
    {#if submitted && error}<Alert tone="danger">{error}</Alert>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_schema_properties_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{m.settings_schema_groups_save()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
</style>
