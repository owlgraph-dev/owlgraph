<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Every open flag is bound to the editor's, which reads them all for its
  // overlay check (desktop/overlays.svelte.ts); title and slug are local, the
  // tags the editor's mirror.
  import { untrack } from 'svelte';
  import { Button, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, FieldError, TriggerFace } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { Logo } from '$lib/features/site/components';
  import InlineEditField from './InlineEditField.svelte';
  import TagsPopover from './TagsPopover.svelte';
  import { nodePath } from '$lib/features/nodes';
  import * as m from '$lib/paraglide/messages';

  let {
    title = '',
    slug = '',
    namespaceSlug = null,
    onRename,
    tags = [],
    onSetTags,
    tagSuggestions = [],
    accessControlOpen = $bindable(),
    moreOpen = $bindable(),
    tagsPopoverOpen = $bindable(),
    pagePropertiesDialogOpen = $bindable(),
    blockSettingsOpen = $bindable(),
    lockLost = false,
    onRequestDelete,
    onRequestContentScheme,
  }: {
    title?: string;
    slug?: string;
    namespaceSlug?: string | null;
    onRename?: (changes: { title?: string; slug?: string }) => Promise<{ ok: boolean; title?: string; slug?: string; error?: string }>;
    tags?: string[];
    onSetTags?: (tags: string[]) => void;
    tagSuggestions?: string[];
    accessControlOpen: boolean;
    moreOpen: boolean;
    tagsPopoverOpen: boolean;
    pagePropertiesDialogOpen: boolean;
    /** Whether the block settings panel shows; absent where the editor has none, which draws no toggle. */
    blockSettingsOpen?: boolean;
    lockLost?: boolean;
    onRequestDelete: () => void;
    /** Opens the page's colour scheme dialog; absent hides the menu item. */
    onRequestContentScheme?: () => void;
  } = $props();

  let titleVal = $state(untrack(() => title));
  let slugVal = $state(untrack(() => slug));
  // One error line under the row, for whichever field was rejected last; a
  // field clearing its own error leaves the other's in place.
  let metaError = $state<{ field: 'title' | 'slug'; message: string } | null>(null);
  const uid = $props.id();
  const metaErrorId = `${uid}-meta-error`;
  function setMetaError(field: 'title' | 'slug', message: string | null) {
    if (message) metaError = { field, message };
    else if (metaError?.field === field) metaError = null;
  }

  // InlineEditField calls these only for a changed, non-empty value.
  async function commitTitleValue(next: string): Promise<{ ok: boolean; error?: string } | undefined> {
    const res = await onRename?.({ title: next });
    if (res?.ok) { titleVal = res.title ?? next; return { ok: true }; }
    return { ok: false, error: res?.error ?? m.editor_header_title_error() };
  }

  async function commitSlugValue(next: string): Promise<{ ok: boolean; error?: string } | undefined> {
    const res = await onRename?.({ slug: next });
    if (res?.ok) { slugVal = res.slug ?? next; return { ok: true }; }
    return { ok: false, error: res?.error ?? m.editor_header_slug_error_taken() };
  }
</script>

<!-- Links out of the editor's head are full navigations: the editor runs
     under a looser style-src than a page, and a policy belongs to the
     document (platform/cspRoutes.ts). -->
<div class="head-row" data-sveltekit-reload>
    <Logo />
    <span class="tb-sep"></span>
    <div class="head-titlewrap">
      <InlineEditField
        variant="title"
        value={titleVal}
        placeholder={m.editor_header_title_placeholder()}
        ariaLabel={m.editor_header_title_aria()}
        editTitle={m.editor_header_title_edit_title()}
        disabled={!onRename}
        errorId={metaErrorId}
        onCommit={commitTitleValue}
        onError={(msg: string | null) => setMetaError('title', msg)}
      />
      <InlineEditField
        variant="slug"
        value={slugVal}
        prefix="/"
        ariaLabel={m.editor_header_slug_aria()}
        editTitle={m.editor_header_slug_edit_title()}
        disabled={!onRename}
        errorId={metaErrorId}
        onCommit={commitSlugValue}
        onError={(msg: string | null) => setMetaError('slug', msg)}
      />
    </div>
    <TagsPopover
      bind:open={tagsPopoverOpen}
      {tags}
      {onSetTags}
      {tagSuggestions}
    />
    <Button variant="ghost" size="sm" icon active={pagePropertiesDialogOpen} title={m.editor_properties_trigger_title()} aria-label={m.editor_properties_trigger_title()} onclick={() => (pagePropertiesDialogOpen = true)}><Icon name="braces" /></Button>
    <Button variant="ghost" size="sm" icon active={accessControlOpen} aria-pressed={accessControlOpen} title={m.editor_header_access_control()} aria-label={m.editor_header_access_control()} onclick={() => (accessControlOpen = true)}><Icon name="lock" /></Button>
    <span class="head-more">
      <DropdownMenu open={moreOpen} onOpenChange={(v) => (moreOpen = v)} align="end" ariaLabel={m.editor_more_menu_aria()} triggerProps={{ title: m.editor_more_menu_title(), 'aria-label': m.editor_more_menu_title() }}>
        {#snippet trigger()}
          <TriggerFace variant="ghost" size="sm" icon><Icon name="more" /></TriggerFace>
        {/snippet}
        <DropdownMenuItem href={slugVal ? nodePath(namespaceSlug, slugVal) : '#'} target="_blank" rel="noopener">
          <span class="menu-item-row"><Icon name="eye" size={16} /><span>{m.editor_header_view_page()}</span></span>
        </DropdownMenuItem>
        {#if onRequestContentScheme}
          <DropdownMenuItem onSelect={onRequestContentScheme}>
            <span class="menu-item-row"><Icon name="sun" size={16} /><span>{m.editor_more_menu_content_scheme()}</span></span>
          </DropdownMenuItem>
        {/if}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" disabled={lockLost} onSelect={onRequestDelete}>
          <span class="menu-item-row"><Icon name="trash" size={16} /><span>{m.editor_more_menu_delete_page()}</span></span>
        </DropdownMenuItem>
      </DropdownMenu>
    </span>
    {#if blockSettingsOpen !== undefined}
      <Button variant="ghost" size="sm" icon active={blockSettingsOpen} aria-pressed={blockSettingsOpen} title={m.editor_header_block_settings_toggle()} aria-label={m.editor_header_block_settings_toggle()} onclick={() => (blockSettingsOpen = !blockSettingsOpen)}><Icon name="sidebar" /></Button>
    {/if}
  </div>
{#if metaError}<div class="meta-error"><FieldError id={metaErrorId} message={metaError.message} /></div>{/if}

<style>
  .head-row { height: var(--appbar-top-h); display: flex; align-items: center; gap: 0.5rem; padding: 0rem 1rem 0rem 1rem; border-bottom: 1px solid var(--ds-color-border); }
  /* In a row: a title-over-slug stack doesn't fit --appbar-top-h. The title
     truncates; the slug stays fully visible. */
  .head-titlewrap { flex: 1; min-width: 0; display: flex; flex-direction: row; align-items: center; gap: 0.5rem; }
  .head-titlewrap > :global(.field-view-title),
  .head-titlewrap > :global(.field-edit-title) { flex: 1 1 auto; min-width: 0; }
  .head-titlewrap > :global(.field-view-slug),
  .head-titlewrap > :global(.field-edit-slug) { flex: 0 0 auto; }
  .meta-error { padding: 0.3rem 1rem; border-bottom: 1px solid var(--ds-color-border); }
  /* Copies of the toolbar's and the Insert menu's rules: scoped CSS doesn't cross files. */
  .tb-sep { width: 1px; align-self: center; height: 1.4rem; background: var(--ds-color-border); margin: 0 0.35rem; }
  .head-more { position: relative; display: inline-flex; }
  .menu-item-row { display: flex; align-items: center; gap: 0.6rem; }
</style>
