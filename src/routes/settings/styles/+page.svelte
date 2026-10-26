<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Stylesheets are emitted in this order, so a later one overrides an earlier
  // one. Switched off, a stylesheet leaves the served CSS on the next render.
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, type TableColumn, EmptyState, Switch, Dialog } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import StylesheetModal from '$lib/features/site/routes/StylesheetModal.svelte';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  type Row = (typeof data.sheets)[number];
  type ModalState = { mode: 'create' } | { mode: 'rename'; sheet: Row };

  let modal = $state<ModalState | null>(null);
  let deleting = $state<Row | null>(null);
  const deleteFormId = 'stylesheet-delete-form';

  const columns = $derived<TableColumn[]>([
    { label: m.settings_styles_col_name() },
    { label: m.settings_styles_col_styles(), width: '6rem' },
    { label: m.settings_styles_col_enabled(), width: '7rem' },
    { label: m.settings_styles_col_order(), width: '6rem' },
    { label: m.settings_col_actions(), width: '6rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_styles_title()} intro={m.settings_styles_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_styles_add()}</Button>
</SettingsPageHead>

{#if data.sheets.length > 0}
  <Table {columns} minWidth="42rem" ariaLabel={m.settings_styles_title()}>
    {#each data.sheets as sheet, index (sheet.id)}
      <TableRow>
        <TableCell truncate title={sheet.name}>
          <a href={`/settings/styles/${sheet.id}`}>{sheet.name}</a>
        </TableCell>
        <TableCell muted nowrap>{sheet.styleCount}</TableCell>
        <TableCell>
          <!-- A Switch applies at once, so it submits its own row's form (docs/architecture/settings.md). -->
          <form id={`toggle-${sheet.id}`} method="POST" action="?/toggleSheet" use:enhance>
            <input type="hidden" name="id" value={sheet.id} />
            <input type="hidden" name="enabled" value={String(!sheet.enabled)} />
            <Switch
              checked={sheet.enabled}
              size="sm"
              ariaLabel={m.settings_styles_enabled_label()}
              onCheckedChange={() => (document.getElementById(`toggle-${sheet.id}`) as HTMLFormElement | null)?.requestSubmit()}
            />
          </form>
        </TableCell>
        <TableCell nowrap>
          <form method="POST" action="?/moveSheet" use:enhance class="order">
            <input type="hidden" name="id" value={sheet.id} />
            <input type="hidden" name="direction" value="up" />
            <Button type="submit" variant="ghost" size="sm" icon disabled={index === 0} title={m.settings_styles_move_up()} aria-label={m.settings_styles_move_up()}>↑</Button>
          </form>
          <form method="POST" action="?/moveSheet" use:enhance class="order">
            <input type="hidden" name="id" value={sheet.id} />
            <input type="hidden" name="direction" value="down" />
            <Button type="submit" variant="ghost" size="sm" icon disabled={index === data.sheets.length - 1} title={m.settings_styles_move_down()} aria-label={m.settings_styles_move_down()}>↓</Button>
          </form>
        </TableCell>
        <TableCell actions>
          <Button type="button" variant="ghost" size="sm" icon title={m.settings_styles_edit()} aria-label={m.settings_styles_edit()} onclick={() => (modal = { mode: 'rename', sheet })}>
            <Icon name="pencil" size={14} />
          </Button>
          <Button type="button" variant="ghost-danger" size="sm" icon title={m.settings_styles_delete()} aria-label={m.settings_styles_delete()} onclick={() => (deleting = sheet)}>
            <Icon name="trash" size={14} />
          </Button>
        </TableCell>
      </TableRow>
    {/each}
  </Table>
{:else}
  <EmptyState>{m.settings_styles_empty()}</EmptyState>
{/if}

{#if modal}
  <StylesheetModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    sheet={modal.mode === 'rename' ? modal.sheet : null}
    error={form?.error?.message ?? null}
    onSaved={() => (modal = null)}
  />
{/if}

<Dialog
  open={deleting !== null}
  onOpenChange={(o) => { if (!o) deleting = null; }}
  size="sm"
  variant="danger"
  title={m.settings_styles_delete_title()}
  description={m.settings_styles_delete_confirm()}
>
  <form id={deleteFormId} method="POST" action="?/deleteSheet" use:enhance={() => async ({ update }) => { await update(); deleting = null; }}>
    <input type="hidden" name="id" value={deleting?.id ?? ''} />
  </form>
  {#snippet footer()}
    <Button type="button" onclick={() => (deleting = null)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={deleteFormId} variant="danger">{m.settings_styles_delete()}</Button>
  {/snippet}
</Dialog>

<style>
  .order { display: inline-block; }
</style>
