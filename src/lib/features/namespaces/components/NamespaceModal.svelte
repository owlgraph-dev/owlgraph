<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The default namespace has no URL prefix, so its form has no slug field;
  // the action reads an absent slug as unchanged.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Select, Alert, FormField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  type Row = { id: string; name: string; slug: string | null; access_level: string; is_default: boolean; inheriting_count: number };

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

  const formId = 'namespace-form';
  const accessItems = [
    { value: 'public', label: m.settings_namespaces_access_public() },
    { value: 'internal', label: m.settings_namespaces_access_internal() },
    { value: 'restricted', label: m.settings_namespaces_access_restricted() },
  ];
  let name = $state(untrack(() => row?.name ?? ''));
  let slug = $state(untrack(() => row?.slug ?? ''));
  // Internal is the secure default (docs/architecture/authorization.md).
  let accessLevel = $state(untrack(() => row?.access_level ?? 'internal'));
  let submitted = $state(false);
  const hasSlug = $derived(mode === 'create' || !row?.is_default);

  // Widening the namespace widens every node that inherits it: say how many
  // before the admin saves.
  const RANK: Record<string, number> = { public: 0, internal: 1, restricted: 2 };
  const widenWarning = $derived.by(() => {
    if (mode !== 'edit' || !row || row.inheriting_count === 0) return null;
    if ((RANK[accessLevel] ?? 2) >= (RANK[row.access_level] ?? 2)) return null;
    return accessLevel === 'public'
      ? m.settings_namespaces_widen_public({ count: row.inheriting_count })
      : m.settings_namespaces_widen_internal({ count: row.inheriting_count });
  });

  const title = $derived(mode === 'create' ? m.settings_namespaces_add() : m.settings_namespaces_edit_heading());
  const canSave = $derived(!!name.trim() && (!hasSlug || !!slug.trim()));
</script>

<Dialog {open} {onOpenChange} size="md" {title}>
  <form
    id={formId}
    method="POST"
    action={mode === 'create' ? '?/create' : '?/update'}
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    {#if mode === 'edit' && row}<input type="hidden" name="id" value={row.id} />{/if}
    <FormField label={m.settings_namespaces_name_field()}><Input name="name" bind:value={name} required autofocus /></FormField>
    {#if hasSlug}
      <FormField label={m.settings_namespaces_slug_field()}><Input name="slug" bind:value={slug} required /></FormField>
    {/if}
    <FormField label={m.settings_namespaces_access_field()} warning={widenWarning}>
      <Select items={accessItems} bind:value={accessLevel} width="full" />
      <input type="hidden" name="accessLevel" value={accessLevel} />
    </FormField>
    {#if submitted && error}<Alert tone="danger">{error}</Alert>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{mode === 'create' ? m.settings_namespaces_create_button() : m.settings_save()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
</style>
