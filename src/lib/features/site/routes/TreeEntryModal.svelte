<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { PagePicker } from '$lib/features/search/picker';
  import { Dialog, Button, Input, FormField, RadioGroup } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { TreeNodeAdminRow, TreeNodeKind, TreeTargetType } from '../types';

  type PageResult = { id: string; slug: string; title: string };

  let {
    open,
    onOpenChange,
    mode,
    kind,
    parentId,
    node,
    createAction,
    updateAction,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    kind: TreeNodeKind;
    parentId: string | null;
    node: TreeNodeAdminRow | null;
    createAction: string;
    updateAction: string;
    onSaved: () => void;
  } = $props();

  const formId = 'tree-entry-form';

  // A one-time snapshot: TreeEditor remounts this per open.
  let label = $state(untrack(() => node?.label ?? ''));
  let targetType = $state<TreeTargetType>(untrack(() => node?.target_type ?? 'page'));
  let page = $state<PageResult | null>(
    untrack(() =>
      node?.target_type === 'page' && node.target_page_id && node.page_slug
        ? { id: node.target_page_id, slug: node.page_slug, title: node.page_title ?? node.page_slug }
        : null
    )
  );
  let url = $state(untrack(() => (node?.target_type === 'url' ? (node.url ?? '') : '')));

  const title = $derived(
    mode === 'create'
      ? kind === 'group'
        ? m.settings_navigation_tree_modal_add_group_title()
        : m.settings_navigation_tree_modal_add_link_title()
      : kind === 'group'
        ? m.settings_navigation_tree_modal_edit_group_title()
        : m.settings_navigation_tree_modal_edit_link_title()
  );

  const canSave = $derived(!!label.trim() && (kind === 'group' || (targetType === 'page' ? !!page : !!url.trim())));
</script>

<Dialog {open} {onOpenChange} size="sm" {title}>
  <form
    id={formId}
    method="POST"
    action={mode === 'create' ? createAction : updateAction}
    use:enhance={() => async ({ update }) => {
      await update();
      onSaved();
    }}
  >
    {#if mode === 'create'}
      <input type="hidden" name="kind" value={kind} />
      {#if parentId}<input type="hidden" name="parentId" value={parentId} />{/if}
    {:else if node}
      <input type="hidden" name="id" value={node.id} />
    {/if}
    {#if kind === 'link'}
      <input type="hidden" name="targetType" value={targetType} />
      {#if targetType === 'page'}
        <input type="hidden" name="targetPageId" value={page?.id ?? ''} />
      {/if}
    {/if}

    <FormField label={m.settings_navigation_tree_label_field()}><Input name="label" bind:value={label} required /></FormField>

    {#if kind === 'link'}
      <FormField label={m.settings_navigation_tree_target_field()} group>
        <RadioGroup
          size="sm"
          items={[
            { value: 'page', label: m.settings_navigation_tree_target_page() },
            { value: 'url', label: m.settings_navigation_tree_target_url() },
          ]}
          value={targetType}
          onValueChange={(v) => (targetType = v as TreeTargetType)}
        />
      </FormField>
      {#if targetType === 'page'}
        {#if page}
          <p class="picked">
            {page.title} <span class="slug">/{page.slug}</span>
            <Button type="button" variant="ghost" size="sm" onclick={() => (page = null)}>{m.settings_navigation_tree_change()}</Button>
          </p>
        {:else}
          <PagePicker onselect={(p) => (page = p)} />
        {/if}
      {:else}
        <FormField label={m.settings_navigation_tree_url_field()}><Input name="url" bind:value={url} placeholder={m.settings_navigation_tree_url_placeholder()} required /></FormField>
      {/if}
    {/if}
  </form>

  {#snippet footer()}
    <Button type="button" size="sm" onclick={() => onOpenChange(false)}>{m.settings_navigation_tree_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" size="sm" disabled={!canSave}>{m.settings_navigation_tree_save()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: 0.6rem; }
  .picked { margin: 0; font-size: var(--ds-text-md); display: flex; align-items: center; gap: var(--ds-space-sm); }
  .picked .slug { color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
</style>
