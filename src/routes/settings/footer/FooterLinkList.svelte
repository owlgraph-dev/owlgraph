<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A link column's entries and the legal-line links, by their own action URLs.
  import { enhance } from '$app/forms';
  import { PagePicker } from '$lib/features/search/picker';
  import { Button, Input, FormField, EmptyState, RadioGroup } from '$lib/design-system';
  import { nodePath } from '$lib/features/nodes';
  import type { FooterLinkAdminRow } from '$lib/features/site';
  import * as m from '$lib/paraglide/messages';

  type FooterLinkItem = Pick<FooterLinkAdminRow, 'id' | 'label' | 'target_type' | 'target_page_id' | 'url' | 'page_title' | 'page_slug' | 'namespace_slug'>;
  type PageResult = { id: string; slug: string; title: string };

  let {
    links,
    columnId = null,
    createAction,
    updateAction,
    deleteAction,
    moveAction,
  }: {
    links: FooterLinkItem[];
    columnId?: string | null;
    createAction: string;
    updateAction: string;
    deleteAction: string;
    moveAction: string;
  } = $props();

  let newLabel = $state('');
  const targetItems = $derived([
    { value: 'page', label: m.settings_footer_link_target_page() },
    { value: 'url', label: m.settings_footer_link_target_url() },
  ]);
  let newTargetType = $state<'page' | 'url'>('page');
  let newPage = $state<PageResult | null>(null);
  let newUrl = $state('');

  function resetAddForm() {
    newLabel = '';
    newTargetType = 'page';
    newPage = null;
    newUrl = '';
  }

  let editingId = $state<string | null>(null);
  let editLabel = $state('');
  let editTargetType = $state<'page' | 'url'>('page');
  let editPage = $state<PageResult | null>(null);
  let editUrl = $state('');

  function startEdit(e: FooterLinkItem) {
    editingId = e.id;
    editLabel = e.label;
    editTargetType = e.target_type;
    editPage =
      e.target_type === 'page' && e.target_page_id && e.page_slug
        ? { id: e.target_page_id, slug: e.page_slug, title: e.page_title ?? e.page_slug }
        : null;
    editUrl = e.target_type === 'url' ? (e.url ?? '') : '';
  }
  function cancelEdit() {
    editingId = null;
  }
</script>

{#if links.length === 0}
  <div class="empty"><EmptyState>{m.settings_footer_link_list_empty()}</EmptyState></div>
{:else}
  <ul class="entries">
    {#each links as e, i (e.id)}
      {#if editingId === e.id}
        <li class="entry editing">
          <form
            method="POST"
            action={updateAction}
            use:enhance={() => async ({ update }) => { await update(); editingId = null; }}
            class="edit-form"
          >
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="targetType" value={editTargetType} />
            {#if editTargetType === 'page'}
              <input type="hidden" name="targetPageId" value={editPage?.id ?? ''} />
            {/if}
            <FormField label={m.settings_footer_link_label()}><Input name="label" bind:value={editLabel} required /></FormField>
            <FormField label={m.settings_footer_link_target_field()} group>
              <RadioGroup size="sm" items={targetItems} value={editTargetType} onValueChange={(v) => (editTargetType = v === 'url' ? 'url' : 'page')} />
            </FormField>
            {#if editTargetType === 'page'}
              {#if editPage}
                <p class="picked">{editPage.title} <span class="slug">/{editPage.slug}</span> <Button type="button" variant="ghost" size="sm" onclick={() => (editPage = null)}>{m.settings_footer_link_change()}</Button></p>
              {:else}
                <PagePicker onselect={(p) => (editPage = p)} />
              {/if}
            {:else}
              <FormField label={m.settings_footer_link_url_field()}><Input name="url" bind:value={editUrl} placeholder={m.settings_footer_link_url_placeholder()} required /></FormField>
            {/if}
            <div class="row-actions">
              <Button type="submit" variant="primary" size="sm" disabled={editTargetType === 'page' && !editPage}>{m.settings_footer_link_save()}</Button>
              <Button type="button" size="sm" onclick={cancelEdit}>{m.settings_footer_link_cancel()}</Button>
            </div>
          </form>
        </li>
      {:else}
        <li class="entry">
          <span class="label">{e.label}</span>
          <span class="target">
            {#if e.target_type === 'page'}
              {#if e.page_slug}<a href={nodePath(e.namespace_slug, e.page_slug)} target="_blank" rel="noopener">{e.page_title} · /{e.page_slug}</a>{:else}<em>{m.settings_footer_link_page_not_found()}</em>{/if}
            {:else}
              <a href={e.url} target="_blank" rel="noopener">{e.url}</a>
            {/if}
          </span>
          <span class="row-actions">
            <form method="POST" action={moveAction} use:enhance class="inline">
              <input type="hidden" name="id" value={e.id} />
              {#if columnId}<input type="hidden" name="columnId" value={columnId} />{/if}
              <input type="hidden" name="direction" value="up" />
              <Button type="submit" variant="ghost" size="sm" icon disabled={i === 0} aria-label={m.settings_footer_link_move_up()} title={m.settings_footer_link_move_up()}>↑</Button>
            </form>
            <form method="POST" action={moveAction} use:enhance class="inline">
              <input type="hidden" name="id" value={e.id} />
              {#if columnId}<input type="hidden" name="columnId" value={columnId} />{/if}
              <input type="hidden" name="direction" value="down" />
              <Button type="submit" variant="ghost" size="sm" icon disabled={i === links.length - 1} aria-label={m.settings_footer_link_move_down()} title={m.settings_footer_link_move_down()}>↓</Button>
            </form>
            <Button type="button" variant="ghost" size="sm" onclick={() => startEdit(e)}>{m.settings_footer_link_edit()}</Button>
            <form method="POST" action={deleteAction} use:enhance class="inline">
              <input type="hidden" name="id" value={e.id} />
              <Button type="submit" variant="ghost-danger" size="sm">{m.settings_footer_link_remove()}</Button>
            </form>
          </span>
        </li>
      {/if}
    {/each}
  </ul>
{/if}

<form
  method="POST"
  action={createAction}
  use:enhance={() => async ({ update }) => { await update(); resetAddForm(); }}
  class="new-entry"
>
  <input type="hidden" name="targetType" value={newTargetType} />
  {#if columnId}<input type="hidden" name="columnId" value={columnId} />{/if}
  {#if newTargetType === 'page'}
    <input type="hidden" name="targetPageId" value={newPage?.id ?? ''} />
  {/if}
  <FormField label={m.settings_footer_link_label()}><Input name="label" bind:value={newLabel} placeholder={m.settings_footer_link_label_placeholder()} required /></FormField>
  <FormField label={m.settings_footer_link_target_field()} group>
    <RadioGroup size="sm" items={targetItems} value={newTargetType} onValueChange={(v) => (newTargetType = v === 'url' ? 'url' : 'page')} />
  </FormField>
  {#if newTargetType === 'page'}
    {#if newPage}
      <p class="picked">{newPage.title} <span class="slug">/{newPage.slug}</span> <Button type="button" variant="ghost" size="sm" onclick={() => (newPage = null)}>{m.settings_footer_link_change()}</Button></p>
    {:else}
      <PagePicker onselect={(p) => (newPage = p)} />
    {/if}
  {:else}
    <FormField label={m.settings_footer_link_url_field()}><Input name="url" bind:value={newUrl} placeholder={m.settings_footer_link_url_placeholder()} required /></FormField>
  {/if}
  <div class="form-actions">
    <Button type="submit" variant="primary" size="sm" disabled={!newLabel.trim() || (newTargetType === 'page' ? !newPage : !newUrl.trim())}>{m.settings_footer_link_add()}</Button>
  </div>
</form>

<style>
  .empty { margin: 0 0 0.6rem; }
  .entries { list-style: none; margin: 0 0 0.8rem; padding: 0; }
  .entry { display: flex; align-items: center; gap: 1rem; padding: 0.3rem 0; border-bottom: 1px solid var(--ds-color-border); }
  .entry .label { font-weight: var(--ds-weight-medium); flex: none; min-width: 10ch; }
  .entry .target { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .row-actions { display: flex; align-items: center; gap: 0.5rem; flex: none; }
  .row-actions > form { display: inline-flex; }
  .inline { display: inline; }
  /* Text glyphs, whose labels the footer specs address. */
  .entry.editing { display: block; }
  .edit-form, .new-entry { display: flex; flex-direction: column; gap: 0.5rem; }
  .new-entry { border: 1px dashed var(--ds-color-border); border-radius: var(--ds-radius-md); padding: 0.7rem 0.8rem; }
  .picked { margin: 0; font-size: var(--ds-text-md); display: flex; align-items: center; gap: var(--ds-space-sm); }
  .picked .slug { color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .form-actions { display: flex; justify-content: flex-end; }
</style>
