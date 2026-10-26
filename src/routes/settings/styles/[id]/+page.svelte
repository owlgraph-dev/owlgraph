<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One stylesheet: its named styles, its free CSS, and a preview of both.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, type TableColumn, EmptyState, Dialog, SettingsGroup, SettingsRow } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import CustomStylesPreview from '$lib/features/site/routes/CustomStylesPreview.svelte';
  import CssField from '$lib/features/site/routes/CssField.svelte';
  import CustomStyleModal from '$lib/features/site/routes/CustomStyleModal.svelte';
  import { contentTokens, slugFromLabel, type CustomStyleRow } from '$lib/features/site';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  type ModalState = { mode: 'create' } | { mode: 'edit'; style: CustomStyleRow };

  let modal = $state<ModalState | null>(null);
  let deleting = $state<CustomStyleRow | null>(null);
  const deleteFormId = 'custom-style-delete-form';

  // Built here: it needs the brand colours, which the root layout has set by now.
  const tokens = contentTokens();

  // A one-time snapshot, re-seeded only when the loaded value changes (a save,
  // a navigation), so typing is never overwritten mid-edit.
  let freeCss = $state(untrack(() => data.sheet.freeCss));
  let lastLoaded = untrack(() => data.sheet.freeCss);
  $effect(() => {
    if (data.sheet.freeCss !== lastLoaded) {
      lastLoaded = data.sheet.freeCss;
      freeCss = data.sheet.freeCss;
    }
  });

  // The free CSS's issues from the last rejected save; a style's live in its modal.
  const freeCssIssues = $derived(form?.cssIssues ?? []);

  const columns = $derived<TableColumn[]>([
    { label: m.settings_styles_col_label() },
    { label: m.settings_styles_col_class(), width: '12rem' },
    { label: m.settings_styles_col_kind(), width: '8rem' },
    { label: m.settings_styles_col_order(), width: '6rem' },
    { label: m.settings_col_actions(), width: '6rem', align: 'end', hideLabel: true },
  ]);

  const kindLabel = (kind: string) => (kind === 'block' ? m.settings_styles_style_kind_block() : m.settings_styles_style_kind_inline());
</script>

<SettingsPageHead title={data.sheet.name} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_styles_style_add()}</Button>
</SettingsPageHead>

<p class="back"><a href="/settings/styles">← {m.settings_styles_back()}</a></p>

<SettingsGroup title={m.settings_styles_named_title()} intro={m.settings_styles_named_intro()}>
  <div class="section-body">
    {#if data.sheet.styles.length > 0}
      <Table {columns} minWidth="44rem" ariaLabel={m.settings_styles_named_title()}>
        {#each data.sheet.styles as style, index (style.id)}
          <TableRow>
            <TableCell truncate title={style.label}>{style.label}</TableCell>
            <TableCell mono>cs-{style.slug}</TableCell>
            <TableCell muted nowrap>{kindLabel(style.kind)}</TableCell>
            <TableCell nowrap>
              <form method="POST" action="?/moveStyle" use:enhance class="order">
                <input type="hidden" name="id" value={style.id} />
                <input type="hidden" name="direction" value="up" />
                <Button type="submit" variant="ghost" size="sm" icon disabled={index === 0} title={m.settings_styles_move_up()} aria-label={m.settings_styles_move_up()}>↑</Button>
              </form>
              <form method="POST" action="?/moveStyle" use:enhance class="order">
                <input type="hidden" name="id" value={style.id} />
                <input type="hidden" name="direction" value="down" />
                <Button type="submit" variant="ghost" size="sm" icon disabled={index === data.sheet.styles.length - 1} title={m.settings_styles_move_down()} aria-label={m.settings_styles_move_down()}>↓</Button>
              </form>
            </TableCell>
            <TableCell actions>
              <Button type="button" variant="ghost" size="sm" icon title={m.settings_styles_edit()} aria-label={m.settings_styles_edit()} onclick={() => (modal = { mode: 'edit', style })}>
                <Icon name="pencil" size={14} />
              </Button>
              <Button type="button" variant="ghost-danger" size="sm" icon title={m.settings_styles_delete()} aria-label={m.settings_styles_delete()} onclick={() => (deleting = style)}>
                <Icon name="trash" size={14} />
              </Button>
            </TableCell>
          </TableRow>
        {/each}
      </Table>
    {:else}
      <EmptyState size="sm">{m.settings_styles_named_empty()}</EmptyState>
    {/if}
  </div>
</SettingsGroup>

<SettingsGroup title={m.settings_styles_free_title()} intro={m.settings_styles_free_intro()}>
  <SettingsRow label={m.settings_styles_free_label()} description={m.settings_styles_free_hint()} layout="wide">
    <form method="POST" action="?/saveFreeCss" use:enhance class="free-form">
      <CssField
        bind:value={freeCss}
        name="css"
        id="free-css"
        {tokens}
        issues={freeCssIssues}
        rows={14}
        ariaLabel={m.settings_styles_free_label()}
      />
      <div class="free-actions">
        <Button type="submit" variant="primary">{m.settings_styles_free_save()}</Button>
      </div>
    </form>
  </SettingsRow>
</SettingsGroup>

<SettingsGroup title={m.settings_styles_preview_title()} intro={m.settings_styles_preview_intro()}>
  <div class="section-body">
    <CustomStylesPreview sheet={{ id: data.sheet.id, freeCss }} styles={data.sheet.styles} />
  </div>
</SettingsGroup>

{#if modal}
  <CustomStyleModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    style={modal.mode === 'edit' ? modal.style : null}
    previewSlug={slugFromLabel}
    {tokens}
    error={form?.error?.message ?? null}
    onSaved={() => (modal = null)}
  />
{/if}

<Dialog
  open={deleting !== null}
  onOpenChange={(o) => { if (!o) deleting = null; }}
  size="sm"
  variant="danger"
  title={m.settings_styles_style_delete_title()}
  description={m.settings_styles_style_delete_confirm()}
>
  <form id={deleteFormId} method="POST" action="?/deleteStyle" use:enhance={() => async ({ update }) => { await update(); deleting = null; }}>
    <input type="hidden" name="id" value={deleting?.id ?? ''} />
  </form>
  {#snippet footer()}
    <Button type="button" onclick={() => (deleting = null)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={deleteFormId} variant="danger">{m.settings_styles_delete()}</Button>
  {/snippet}
</Dialog>

<style>
  .back { margin: 0 0 var(--ds-space-md); font-size: var(--ds-text-sm); }
  /* Not in a SettingsRow, whose label would only repeat the section's title. */
  .section-body { min-width: 0; }
  .order { display: inline-block; }
  .free-form { display: grid; gap: var(--ds-space-sm); }
  .free-actions { display: flex; justify-content: flex-end; }
</style>
