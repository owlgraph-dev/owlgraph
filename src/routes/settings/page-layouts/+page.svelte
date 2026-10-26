<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The site's page layouts (docs/architecture/blocks/layout.md, "Page layout: sections"), in the
  // order the page root's picker shows. Switching one off, editing or deleting
  // it leaves the pages that took its values as they are. Standard, every
  // page's fallback, is never switched off or deleted.
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, type TableColumn, Switch, Dialog } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import PageLayoutPresetModal from '$lib/features/site/routes/PageLayoutPresetModal.svelte';
  import { PageLayoutThumbnail } from '$lib/features/pages/components';
  import { presetName } from '$lib/features/pages';
  import CatalogLabel from '$lib/features/semantic/routes/CatalogLabel.svelte';
  import { localize } from '$lib/platform/i18n/localizedText';
  import { rowMissingLocales } from '$lib/features/semantic/routes/catalogFilter';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  type Row = (typeof data.presets)[number];
  type ModalState = { mode: 'create' } | { mode: 'edit'; preset: Row };

  let modal = $state<ModalState | null>(null);
  let deleting = $state<Row | null>(null);
  const deleteFormId = 'page-layout-delete-form';

  const columns = $derived<TableColumn[]>([
    { label: m.settings_page_layouts_col_layout() },
    { label: m.settings_page_layouts_col_enabled(), width: '6rem' },
    { label: m.settings_page_layouts_col_order(), width: '6rem' },
    { label: m.settings_col_actions(), width: '6rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_page_layouts_title()} intro={m.settings_page_layouts_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_page_layouts_add()}</Button>
</SettingsPageHead>

<Table {columns} minWidth="40rem" ariaLabel={m.settings_page_layouts_title()}>
  {#each data.presets as preset, index (preset.id)}
    <TableRow>
      <TableCell>
        <div class="layout">
          <PageLayoutThumbnail template={preset.template} />
          <div class="text">
            <span class="label"><CatalogLabel label={presetName(preset)} missing={rowMissingLocales([{ text: preset.label }, { text: preset.description, optional: true }])} /></span>
            {#if localize(preset.description, '')}<span class="description">{localize(preset.description, '')}</span>{/if}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <!-- A Switch applies at once, so it submits its own row's form (docs/architecture/settings.md). -->
        <form id={`toggle-${preset.id}`} method="POST" action="?/togglePreset" use:enhance>
          <input type="hidden" name="id" value={preset.id} />
          <input type="hidden" name="enabled" value={String(!preset.enabled)} />
          <Switch
            checked={preset.enabled}
            size="sm"
            disabled={preset.protected}
            ariaLabel={m.settings_page_layouts_enabled_label({ label: presetName(preset) })}
            onCheckedChange={() => (document.getElementById(`toggle-${preset.id}`) as HTMLFormElement | null)?.requestSubmit()}
          />
        </form>
      </TableCell>
      <TableCell nowrap>
        <form method="POST" action="?/movePreset" use:enhance class="order">
          <input type="hidden" name="id" value={preset.id} />
          <input type="hidden" name="direction" value="up" />
          <Button type="submit" variant="ghost" size="sm" icon disabled={index === 0} title={m.settings_page_layouts_move_up()} aria-label={m.settings_page_layouts_move_up()}>↑</Button>
        </form>
        <form method="POST" action="?/movePreset" use:enhance class="order">
          <input type="hidden" name="id" value={preset.id} />
          <input type="hidden" name="direction" value="down" />
          <Button type="submit" variant="ghost" size="sm" icon disabled={index === data.presets.length - 1} title={m.settings_page_layouts_move_down()} aria-label={m.settings_page_layouts_move_down()}>↓</Button>
        </form>
      </TableCell>
      <TableCell actions>
        <Button type="button" variant="ghost" size="sm" icon title={m.settings_page_layouts_edit()} aria-label={m.settings_page_layouts_edit()} onclick={() => (modal = { mode: 'edit', preset })}>
          <Icon name="pencil" size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost-danger"
          size="sm"
          icon
          disabled={preset.protected}
          title={preset.protected ? m.settings_page_layouts_protected() : m.settings_page_layouts_delete()}
          aria-label={m.settings_page_layouts_delete()}
          onclick={() => (deleting = preset)}
        >
          <Icon name="trash" size={14} />
        </Button>
      </TableCell>
    </TableRow>
  {/each}
</Table>

{#if modal}
  <PageLayoutPresetModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    preset={modal.mode === 'edit' ? modal.preset : null}
    error={form?.error?.message ?? null}
    onSaved={() => (modal = null)}
  />
{/if}

<Dialog
  open={deleting !== null}
  onOpenChange={(o) => { if (!o) deleting = null; }}
  size="sm"
  variant="danger"
  title={m.settings_page_layouts_delete_title()}
  description={m.settings_page_layouts_delete_confirm()}
>
  <form id={deleteFormId} method="POST" action="?/deletePreset" use:enhance={() => async ({ update }) => { await update(); deleting = null; }}>
    <input type="hidden" name="id" value={deleting?.id ?? ''} />
  </form>
  {#snippet footer()}
    <Button type="button" onclick={() => (deleting = null)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={deleteFormId} variant="danger">{m.settings_page_layouts_delete()}</Button>
  {/snippet}
</Dialog>

<style>
  .order { display: inline-block; }
  .layout { display: flex; align-items: center; gap: var(--ds-space-md); min-width: 0; }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .label { font-weight: var(--ds-weight-medium); }
  .description { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
