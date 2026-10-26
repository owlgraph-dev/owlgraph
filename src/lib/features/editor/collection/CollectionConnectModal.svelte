<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Reconnects a mirrored collection to its source (docs/architecture/plugins.md,
  // "Sources"). The values are sent once and never shown again: the dialog
  // mounts fresh each time it opens.
  import { untrack } from 'svelte';
  import { readApiError } from '$lib/platform/readApiError';
  import { Dialog, Button, Alert, FormField, Input } from '$lib/design-system';
  import type { CollectionSourceView } from '$lib/features/pluginHost';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    collectionId,
    form,
    onConnected,
    onOpenChange,
  }: {
    open: boolean;
    collectionId: string;
    form: NonNullable<CollectionSourceView['form']>;
    onConnected: () => void;
    onOpenChange: (open: boolean) => void;
  } = $props();

  let values = $state<Record<string, string>>(untrack(() => Object.fromEntries(form.fields.map((f) => [f.key, '']))));
  let missing = $state<Record<string, boolean>>({});
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    missing = Object.fromEntries(form.fields.filter((f) => f.required && values[f.key].trim() === '').map((f) => [f.key, true]));
    if (Object.keys(missing).length > 0) return;
    busy = true;
    error = null;
    try {
      const res = await fetch(`/api/collections/${collectionId}/source`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      if (res.ok) {
        onConnected();
        onOpenChange(false);
      } else {
        // A field the form checks itself has no sentence of its own to show.
        const refusal = await readApiError(res);
        error = refusal.code === 'invalid_request' || refusal.code === 'unknown' ? m.collection_connect_failed() : refusal.message;
      }
    } catch {
      error = m.collection_connect_failed();
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} {onOpenChange} size="sm" title={m.collection_connect_title()} description={m.collection_connect_desc()}>
  <form id="collection-connect-form" class="fields" onsubmit={submit} novalidate>
    {#each form.fields as field (field.key)}
      <FormField
        label={field.label}
        hint={field.description ?? undefined}
        optionalLabel={field.required ? undefined : m.form_field_optional()}
        error={missing[field.key] ? m.collection_connect_required() : null}
      >
        <Input
          type={field.kind === 'password' ? 'password' : 'url'}
          name={field.key}
          bind:value={values[field.key]}
          required={field.required}
          autocomplete={field.kind === 'password' ? 'new-password' : 'off'}
          placeholder={field.kind === 'url' ? 'https://' : undefined}
        />
      </FormField>
    {/each}
  </form>
  {#if error}
    <Alert tone="danger">{error}</Alert>
  {/if}
  {#snippet footer()}
    <Button variant="secondary" onclick={() => onOpenChange(false)} disabled={busy}>{m.collection_connect_cancel()}</Button>
    <Button variant="primary" type="submit" form="collection-connect-form" loading={busy}>{m.collection_connect_submit()}</Button>
  {/snippet}
</Dialog>

<style>
  .fields { display: flex; flex-direction: column; gap: var(--ds-space-md); margin-bottom: var(--ds-space-md); }
</style>
