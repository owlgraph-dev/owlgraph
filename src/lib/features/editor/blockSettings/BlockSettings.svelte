<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The block settings panel: the target's own settings, then its capability
  // sections. A block writes by id; a structural cell, a container or a list
  // by its chain position (target.ts).
  import { onDestroy } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { blockSupportsCapability, setSurfaceField, editTier } from '$lib/features/content';
  import type { ContentScheme } from '$lib/features/content';
  import { setSectionSingle, sectionMovesAt } from '$lib/features/content/editor';
  import BlockBreadcrumb from './BlockBreadcrumb.svelte';
  import BreakpointSwitcher from './BreakpointSwitcher.svelte';
  import BlockSettingsEmpty from './BlockSettingsEmpty.svelte';
  import CapabilitySections from './CapabilitySections.svelte';
  import { blockSettingsOf } from '../blocks/settings';
  import { pluginEditorBlock } from '$lib/plugins/editor';
  import BlockSettingsSection from './BlockSettingsSection.svelte';
  import { anyAttrModified } from './modified';
  import { capabilitySectionsFor, emptyKindFor } from './sections';
  import type { BlockSettingsActions, QuickLinkEmbed } from './types';
  import { embedActions } from '../blocks/embedPicker';
  import { blockSettingsTarget } from './target';
  import { setAttrsAt } from '../commands/attrs';
  import type { EditorCore } from '../core/editorCore.svelte';
  import type { ImagePicker } from '../desktop/imagePicker.svelte';
  import type { EditorOverlays } from '../desktop/overlays.svelte';

  let { core, pageId = null, namespace = null, enabledPlugins = new Set(), quickLinkEmbed, onEmbedQuickLink, contentScheme = 'light', images, onRetarget, overlays }: {
    core: EditorCore;
    /** The page being edited: a plugin block's sections create what the block needs in its namespace. */
    pageId?: string | null;
    /** The page's namespace, where a node made from a panel's picker goes. */
    namespace?: { id: string; name: string; slug: string | null } | null;
    /** The plugins turned on (their ids): which kind shows a node an integration keeps. */
    enabledPlugins?: ReadonlySet<string>;
    /** What a quick link to a document can become (docs/architecture/blocks/node-embeds.md, "A quick link becomes a block"). */
    quickLinkEmbed?: (attrs: Readonly<Record<string, unknown>>) => QuickLinkEmbed | null;
    /** Turns the quick link with this id into that block. */
    onEmbedQuickLink?: (id: string) => void;
    /** The page's content scheme: which schemes a colour must read in. */
    contentScheme?: ContentScheme;
    onRetarget?: (id: string) => void;
    /** The editor's one file input: an image's replacement, a background image. */
    images: ImagePicker;
    /** Any popover or menu open here is reported to the editor, so Escape
     * closes it without also stepping the block selection up. */
    overlays: EditorOverlays;
  } = $props();

  const editor = $derived(core.editor ?? null);
  const chain = $derived(core.selection.chain);
  const selectedIndex = $derived(core.selection.index);
  const activeType = $derived(chain[selectedIndex]?.type ?? null);

  // A structural node is written at its position when the write happens.
  const writeAt = (ctx: { pos: number } | null, patch: Record<string, unknown>) => {
    if (core.editor) setAttrsAt(core.editor, ctx?.pos ?? -1, patch);
  };

  const target = $derived(
    blockSettingsTarget(core.selection, {
      pageAttr: (k, v) => core.setPageAttr(k, v),
      selectedAttr: (k, v) => core.updateSelectedAttr(k, v),
      cell: (p) => writeAt(core.selection.cell, p),
      tableCell: (p) => writeAt(core.selection.tableCell, p),
      container: (p) => writeAt(core.selection.container, p),
      list: (p) => writeAt(core.selection.list, p),
    })
  );

  // null where the target isn't directly in a section's cell.
  const moves = $derived(editor && target?.id ? sectionMovesAt(editor, target.id) : null);

  const sections = $derived(
    target && editor
      ? capabilitySectionsFor((cap) => blockSupportsCapability(editor, target.type, cap), target.type, target.attrs, !!moves)
      : []
  );
  const BlockSettings = $derived(target ? blockSettingsOf(target.type) : undefined);
  // The plugin draws the rows, the block settings panel the frame, so every section
  // folds and marks itself modified the same way.
  const pluginSections = $derived(target ? (pluginEditorBlock(target.type)?.sections ?? []) : []);
  const showBlockSection = $derived(!!BlockSettings || pluginSections.length > 0);

  // Written at the viewport edited when the picker opened, and only if the
  // same block is still selected when the upload lands; an unreferenced
  // upload is collected on the next save.
  let surfaceUploading = $state(false);
  function pickSurfaceImage() {
    const at = chain[selectedIndex]?.pos;
    const type = activeType;
    const bp = $editTier;
    images.pickBackground(
      (assetId) => {
        const t = target;
        if (!t || chain[selectedIndex]?.pos !== at || t.type !== type) return;
        t.update({ surface: setSurfaceField(t.attrs.surface, bp, 'image', assetId) });
      },
      (busy) => (surfaceUploading = busy)
    );
  }

  // The panel's overlays each report open/close; the editor needs only
  // whether any is open.
  let overlayCount = $state(0);
  function track(open: boolean) {
    overlayCount = Math.max(0, overlayCount + (open ? 1 : -1));
  }
  $effect(() => {
    overlays.blockSettings = overlayCount > 0;
  });
  onDestroy(() => {
    overlays.blockSettings = false;
  });

  const settingsActions: BlockSettingsActions = {
    retarget: (id) => onRetarget?.(id),
    replaceImage: () => images.pickReplacement(),
    removeBlock: () => core.removeSelectedBlock(),
    overlayOpenChange: (open) => track(open),
    setSectionSingle: (single) => {
      if (editor) setSectionSingle(editor, chain[selectedIndex].pos, single);
    },
    selectPage: () => core.selection.selectAncestor(0),
    ...embedActions({ editor: () => editor, target: () => target, namespace: () => namespace, enabledPlugins: () => enabledPlugins }),
    quickLinkEmbed: (attrs) => quickLinkEmbed?.(attrs) ?? null,
    embedQuickLink: (id) => onEmbedQuickLink?.(id),
  };
</script>

<aside class="block-settings" aria-label={m.editor_block_settings_label()}>
  <BreakpointSwitcher />

  {#if chain.length > 0}
    <BlockBreadcrumb {chain} {selectedIndex} onSelect={(i) => core.selection.selectAncestor(i)} onOverlayOpenChange={track} />
  {/if}

  {#if !target}
    <BlockSettingsEmpty kind="none" />
  {:else}
    {@const t = target}
    {#if BlockSettings}
      <BlockSettings target={t} {editor} actions={settingsActions} />
    {/if}
    {#each pluginSections as section (section.id)}
      {@const PluginSection = section.component}
      <BlockSettingsSection id="block:{section.id}" title={section.title()} modified={anyAttrModified(editor, t.type, t.attrs, [...(section.modifiedKeys ?? [])])}>
        <PluginSection target={t} {editor} {pageId} overlayOpenChange={track} />
      </BlockSettingsSection>
    {/each}

    <CapabilitySections target={t} {editor} {chain} {selectedIndex} {sections} {moves} {contentScheme} {surfaceUploading} onPickSurfaceImage={pickSurfaceImage} onOverlayOpenChange={track} />

    {#if !showBlockSection && sections.length === 0}
      <BlockSettingsEmpty kind={emptyKindFor(t.type)} />
    {/if}
  {/if}
</aside>

<style>
  .block-settings { flex: 0 0 270px; border-left: 1px solid var(--ds-color-border); background: var(--ds-color-bg); overflow-y: auto; padding: 0.75rem 0.85rem 2rem; }
  @media (max-width: 768px) {
    .block-settings { position: absolute; top: 0; right: 0; bottom: 0; flex: none; width: min(320px, 85vw); z-index: 30; background: var(--ds-color-raised-modal); border-left-color: var(--ds-color-border-elevated); box-shadow: var(--ds-shadow-lg); }
  }
</style>
