<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Edit posts ?/update with the role and an optional new password; there is no
  // rename, so email and name show read-only. A refused save keeps it open.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Select, Alert, FormField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { MIN_PASSWORD_LENGTH } from '../passwordPolicy';

  type Row = { id: string; email: string; name: string; role: string };

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

  const formId = 'user-form';
  const roleItems = ['admin', 'editor', 'viewer'].map((r) => ({ value: r, label: r }));
  let email = $state('');
  let name = $state('');
  let role = $state(untrack(() => row?.role ?? 'viewer'));
  let password = $state('');
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_users_add() : m.settings_users_edit_heading());
  const canSave = $derived(mode === 'edit' || (!!email.trim() && !!password));
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
    {#if mode === 'edit' && row}
      <input type="hidden" name="id" value={row.id} />
      <p class="who"><strong>{row.name || row.email}</strong>{#if row.name}<span class="muted">{row.email}</span>{/if}</p>
    {:else}
      <FormField label={m.settings_users_email_field()}><Input name="email" type="email" bind:value={email} required autofocus /></FormField>
      <FormField label={m.settings_users_name_field()} optionalLabel={m.form_field_optional()}><Input name="name" bind:value={name} /></FormField>
    {/if}
    <FormField label={m.settings_users_role_field()}>
      <Select items={roleItems} bind:value={role} width="full" />
      <input type="hidden" name="role" value={role} />
    </FormField>
    {#if mode === 'create'}
      <FormField label={m.settings_users_password_field()} hint={m.settings_users_password_hint({ min: MIN_PASSWORD_LENGTH })}><Input name="password" type="text" bind:value={password} required /></FormField>
    {:else}
      <FormField label={m.settings_users_new_password_field()} optionalLabel={m.form_field_optional()} hint={m.settings_users_password_hint({ min: MIN_PASSWORD_LENGTH })}><Input name="password" type="text" bind:value={password} autofocus /></FormField>
    {/if}
    {#if submitted && error}<Alert tone="danger">{error}</Alert>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{mode === 'create' ? m.settings_users_create() : m.settings_save()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .who { margin: 0 0 0.2rem; display: flex; flex-direction: column; gap: 0.1rem; font-size: var(--ds-text-md); }
  .muted { color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
</style>
