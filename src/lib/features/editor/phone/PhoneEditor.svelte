<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The phone's chrome around the same EditorCore DesktopEditor.svelte mounts.
  // Anything that changes document content belongs in editorCore.svelte.ts,
  // so both shells get it; this file only decides how this shell triggers it.
  import { onMount, onDestroy, untrack } from 'svelte';
  import type { PageEditorProps } from '../meta/nodeMeta';
  import { createPageEditing, reportLockLost } from '../session/pageEditing.svelte';
  import { editTier, STRUCTURAL_BLOCK_TYPES, canvasTier } from '$lib/features/content';
  import type { ClassFields, NodeClassOption } from '$lib/features/semantic';
  import { Alert } from '$lib/design-system';
  import EditorCanvas from '../shared/EditorCanvas.svelte';
  import { CanvasScheme } from '../shared/canvasScheme.svelte';
  import { SelectedBox } from '../shared/selectedBox.svelte';
  import * as m from '$lib/paraglide/messages';
  import PhoneHeader from './PhoneHeader.svelte';
  import PhoneToolbar from './PhoneToolbar.svelte';
  import PhoneCanvasOverlay from './PhoneCanvasOverlay.svelte';
  import PhoneBlockSettingsSheet from './PhoneBlockSettingsSheet.svelte';
  import { embedActions } from '../blocks/embedPicker';
  import { pickerNamespace } from '$lib/features/search/picker';
  import type { BlockSettingsActions } from '../blockSettings/types';
  import { embedTarget } from '../blockSettings/target';

  let {
    doc,
    pageId,
    onSave,
    pages = [],
    documents = [],
    enabledPlugins = [],
    title = '',
    onRename,
    tags = [],
    onSetTags,
    manualProperties = [],
    onSetManualProperties,
    propSuggestions = [],
    propertyGroups = [],
    tagSuggestions = [],
    nodeClassId = null,
    nodeClasses = [],
    onSetNodeClass,
    locale,
    onSetLocale,
    classFields = null,
    visibility = null,
    namespaceAccessLevel,
    namespaceMembers = [],
    shares = [],
    users = [],
    onSetVisibility,
    onSetShares,
    shareLinks = [],
    onCreateShareLink,
    onRevokeShareLink,
    namespaceId,
    namespaces = [],
    onSetNamespace,
    onUploadImage,
    lockLost = false,
    onLockLost,
    contentScheme = null,
    contentSchemeDefault = 'light',
  }: PageEditorProps = $props();

  // The canvas renders in the page's content scheme; an adaptive page follows
  // the author's own scheme here (the preview toggle is desktop's).
  const scheme = new CanvasScheme(() => ({ page: contentScheme, site: contentSchemeDefault }), { preview: false });

  let element = $state<HTMLDivElement>();
  let shell = $state<HTMLDivElement | null>(null);

  const editing = createPageEditing({
    seed: untrack(() => ({ tags, manualProperties, visibility, shares })),
    writes: {
      onSetTags: (t) => onSetTags?.(t) ?? Promise.resolve({ ok: false }),
      onSetManualProperties: (props) => onSetManualProperties?.(props) ?? Promise.resolve({ ok: false }),
      onSetVisibility: (v) => onSetVisibility?.(v) ?? Promise.resolve({ ok: false }),
      onSetShares: (s) => onSetShares?.(s) ?? Promise.resolve({ ok: false }),
    },
    onSave: (json, opts) => onSave(json, opts),
    mountOptions: () => ({ doc, pageId, propSuggestions, onUploadImage, pages, documents, isPhone: true }),
  });
  const { core, meta } = editing;

  const selectedBox = new SelectedBox(core, () => shell, { extendListItems: false });

  onMount(() => {
    // No viewport toggle here: edits target the tier the device's own width
    // renders, and follow it as the device turns.
    const ro = new ResizeObserver(([entry]) => editTier.set(canvasTier(entry.contentRect.width)));
    ro.observe(element!);
    editing.mount(element!);
    return () => ro.disconnect();
  });

  onDestroy(() => {
    core.destroy();
  });

  reportLockLost(core, () => lockLost, (json, dirty, held) => onLockLost?.(json, dirty, held));

  // An embed block's settings, in a sheet. A pick that turns the block into
  // another kind keeps it selected, so the sheet follows it.
  const settingsTarget = $derived(embedTarget(core.selection.selected, (k, v) => core.updateSelectedAttr(k, v)));
  const enabledPluginSet = $derived(new Set(enabledPlugins));
  const settingsActions: BlockSettingsActions = embedActions({
    editor: () => core.editor,
    target: () => settingsTarget,
    namespace: () => pickerNamespace(namespaces, namespaceId),
    enabledPlugins: () => enabledPluginSet,
  });
  let blockSettingsOpen = $state(false);
  $effect(() => {
    if (!settingsTarget) blockSettingsOpen = false;
  });
</script>

<div class="m-editor-app">
  {#if lockLost}
    <Alert tone="danger" layout="banner">{m.editor_lock_lost_banner()}</Alert>
  {/if}
  {#if core.loadFailed}
    <Alert tone="danger" layout="banner">{m.editor_load_failed()}</Alert>
  {/if}
  <div class="m-editor-head">
    <PhoneHeader
      {title}
      {onRename}
      tags={meta.tags}
      onSetTags={meta.commitTags}
      {tagSuggestions}
      {nodeClassId}
      {nodeClasses}
      {onSetNodeClass}
      {locale}
      {onSetLocale}
      pageProperties={core.properties.pageProperties}
      manualProperties={meta.manualProperties}
      onSetManualProperties={meta.commitManualProperties}
      {propSuggestions}
      {propertyGroups}
      classDefinitions={classFields?.definitions ?? []}
      classGroups={classFields?.groups ?? []}
      visibility={meta.visibility}
      {namespaceAccessLevel}
      {namespaceMembers}
      shares={meta.shares}
      {users}
      onSetVisibility={meta.commitVisibility}
      onSetShares={meta.commitShares}
      {shareLinks}
      {onCreateShareLink}
      {onRevokeShareLink}
      {namespaceId}
      {namespaces}
      {onSetNamespace}
    />
  </div>
  <div class="m-editor-scroll">
    <div class="m-editor-shell" bind:this={shell}>
      <PhoneCanvasOverlay selected={core.selection.selected} selectedBox={selectedBox.box} />
      <!-- No page settings on a phone, but the canvas still renders the page's own. -->
      <EditorCanvas page={core.page} firstBlockBleeds={core.firstBlockBleeds} scheme={scheme.attr} {locale} bind:element />
    </div>
  </div>
  <PhoneToolbar
    {core}
    save={editing.save}
    {scheme}
    linkNamespace={pickerNamespace(namespaces, namespaceId)}
    {locale}
    onDeleteBlock={core.selection.selected && !STRUCTURAL_BLOCK_TYPES.has(core.selection.selected.type) ? core.removeSelectedBlock : null}
    onBlockSettings={settingsTarget ? () => (blockSettingsOpen = true) : null}
  />
  <PhoneBlockSettingsSheet
    open={blockSettingsOpen}
    onOpenChange={(o) => (blockSettingsOpen = o)}
    target={settingsTarget}
    {core}
    pageId={pageId ?? null}
    actions={settingsActions}
  />
</div>

<style>
  .m-editor-app { position: fixed; inset: 0; max-width: 100vw; /* the page shell's reason (+layout.svelte) */ display: flex; flex-direction: column; background: var(--ds-color-bg); z-index: 1; }
  .m-editor-head { flex: 0 0 auto; background: var(--ds-color-bg); border-bottom: 1px solid var(--ds-color-border); }
  .m-editor-scroll { flex: 1 1 auto; overflow-y: auto; min-height: 0; padding-bottom: calc(4.5rem + var(--ds-keyboard-inset, 0px)); }
  /* No side inset: blocks wrap exactly as a reader on the same phone sees them. */
  .m-editor-shell { position: relative; padding: 1rem 0; }
</style>
