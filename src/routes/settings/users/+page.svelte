<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Accounts are deactivated, never deleted.
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, type TableColumn } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { UserModal } from '$lib/features/auth/components';
  import * as m from '$lib/paraglide/messages';
  let { data, form } = $props();

  type Row = (typeof data.users)[number];
  type ModalState = { mode: 'create' } | { mode: 'edit'; row: Row };
  let modal = $state<ModalState | null>(null);

  const intro = $derived(
    `${m.settings_users_intro()} admin (${m.settings_users_role_admin_desc()}), editor (${m.settings_users_role_editor_desc()}), viewer (${m.settings_users_role_viewer_desc()}).`
  );
  const columns = $derived<TableColumn[]>([
    { label: m.settings_users_col_email(), width: '17rem' },
    { label: m.settings_users_col_name(), width: '11rem' },
    { label: m.settings_users_col_role(), width: '7rem' },
    { label: m.settings_users_col_status() },
    { label: m.settings_col_actions(), width: '11rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_users_title()} {intro} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_users_add()}</Button>
</SettingsPageHead>

<Table {columns} minWidth="52rem" ariaLabel={m.settings_users_title()}>
  {#each data.users as u (u.id)}
    <TableRow tone={u.is_active ? 'default' : 'muted'} data-id={u.id}>
      <TableCell truncate title={u.email}>{u.email}{#if u.id === data.meId}<span class="you">{m.settings_users_you_badge()}</span>{/if}</TableCell>
      <TableCell truncate title={u.name}>{u.name}</TableCell>
      <TableCell nowrap>{u.role}</TableCell>
      <TableCell muted nowrap>{u.is_active ? m.settings_users_status_active() : m.settings_users_status_inactive()}</TableCell>
      <TableCell actions>
        <form method="POST" action="?/setActive" use:enhance>
          <input type="hidden" name="id" value={u.id} />
          <input type="hidden" name="active" value={(!u.is_active).toString()} />
          <Button type="submit" variant="ghost" size="sm">{u.is_active ? m.settings_users_deactivate() : m.settings_users_activate()}</Button>
        </form>
        <Button type="button" variant="ghost" size="sm" icon title={m.settings_users_edit()} aria-label={m.settings_users_edit()} onclick={() => (modal = { mode: 'edit', row: u })}><Icon name="pencil" size={14} /></Button>
      </TableCell>
    </TableRow>
  {/each}
</Table>

{#if modal}
  <UserModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    row={modal.mode === 'edit' ? modal.row : null}
    error={form?.error?.message ?? null}
    onSaved={() => (modal = null)}
  />
{/if}

<style>
  .you {
    margin-left: 0.4rem;
    font-size: var(--ds-text-xs);
    color: var(--ds-color-accent);
    background: var(--ds-color-accent-soft);
    border-radius: var(--ds-radius-pill);
    padding: 0.05rem 0.45rem;
  }
</style>
