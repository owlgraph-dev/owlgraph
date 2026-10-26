<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The desktop chrome around one EditorCore, which owns the Tiptap instance
  // and every document mutation (docs/architecture/editor.md).
  import { onMount, onDestroy, untrack } from 'svelte';
  import { pageColumnsOf } from '$lib/features/content';
  import EditorCanvas from '../shared/EditorCanvas.svelte';
  import { CanvasScheme } from '../shared/canvasScheme.svelte';
  import { SelectedBox } from '../shared/selectedBox.svelte';
  import { currentBlock, deleteBlockById, moveBlockById } from '$lib/features/content/editor';
  import { pickerNamespace } from '$lib/features/search/picker';
  import { insertCommands, appendBlock } from '../commands/insert';
  import { editTier } from '$lib/features/content';
  import BlockSettings from '../blockSettings/BlockSettings.svelte';
  import EditorHeader from '../meta/EditorHeader.svelte';
  import { DeleteRequest } from '../meta/deleteRequest.svelte';
  import EditorToolbar from './toolbar/EditorToolbar.svelte';
  import { EditorOverlays } from './overlays.svelte';
  import { escapeStepsUp } from './keyboard';
  import { BlockHover } from './hover.svelte';
  import { BlockDrag } from './blockDrag.svelte';
  import { ImagePicker, IMAGE_ACCEPT } from './imagePicker.svelte';
  import { BlockEdit } from './blockEdit.svelte';
  import BlockEditDialogs from './BlockEditDialogs.svelte';
  import CanvasOverlay from './CanvasOverlay.svelte';
  import PageDialogs from './PageDialogs.svelte';
  import PlaceholderInsertMenu from './PlaceholderInsertMenu.svelte';
  import { quickLinkEmbedFor, embedQuickLinkById } from './quickLinkEmbed';
  import { Alert, COMPACT_CHROME_MEDIA } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { PageEditorProps } from '../meta/nodeMeta';
  import { createPageEditing, reportLockLost } from '../session/pageEditing.svelte';

  let {
    doc,
    pageId,
    onSave,
    pages = [],
    documents = [],
    enabledPlugins = [],
    title = '',
    slug = '',
    namespaceSlug = null,
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
    onDelete,
    isHomePage = false,
    contentScheme = null,
    contentSchemeDefault = 'light',
    onSetContentScheme,
  }: PageEditorProps = $props();

  const enabledPluginSet = $derived(new Set(enabledPlugins));

  // What a quick link to one of the documents can become.
  const quickLinkEmbed = $derived(quickLinkEmbedFor(documents, enabledPluginSet));
  function embedQuickLinkBlock(id: string) {
    embedQuickLinkById(core.editor, id, quickLinkEmbed);
  }

  let element = $state<HTMLDivElement>();

  // The metadata is seeded once; afterwards only the mirror's own commits
  // update it. Wrapped, so a callback the parent passes later is the one called.
  const editing = createPageEditing({
    seed: untrack(() => ({ tags, manualProperties, visibility, shares })),
    writes: {
      onSetTags: (t) => onSetTags?.(t) ?? Promise.resolve({ ok: false }),
      onSetManualProperties: (props) => onSetManualProperties?.(props) ?? Promise.resolve({ ok: false }),
      onSetVisibility: (v) => onSetVisibility?.(v) ?? Promise.resolve({ ok: false }),
      onSetShares: (s) => onSetShares?.(s) ?? Promise.resolve({ ok: false }),
    },
    onSave: (json, opts) => onSave(json, opts),
    mountOptions: () => ({ doc, pageId, propSuggestions, onUploadImage, pages, documents, isPhone: false }),
  });
  const { core, meta } = editing;

  // Shrinks the canvas to a device width, so its container queries preview the tier.
  const vpClass = $derived($editTier === 'desktop' ? '' : `vp-${$editTier}`);
  const scheme = new CanvasScheme(() => ({ page: contentScheme, site: contentSchemeDefault }), { preview: true });
  // The block Edit dialogs keep their own flags (blockEdit.svelte.ts).
  const overlays = new EditorOverlays(() => blockEdit.open);
  // On success onDelete has released the lock and navigated away.
  const deletion = new DeleteRequest(() => onDelete);

  // The selected overlay's box, measured like the hover's but from the selection.
  const selectedBox = new SelectedBox(core, () => shell, { extendListItems: true });

  function onGlobalKeydown(e: KeyboardEvent) {
    escapeStepsUp(e, core, overlays.any);
  }

  const images = new ImagePicker(core, () => onUploadImage);

  let shell = $state<HTMLDivElement | null>(null);
  const hover: BlockHover = new BlockHover(core, () => shell, () => drag.dragging);
  const drag: BlockDrag = new BlockDrag(core, () => shell, hover);
  let flashBox = $state<{ top: number; left: number; width: number; height: number } | null>(null);

  const blockEdit = new BlockEdit(() => core.editor);

  function blockEls(): HTMLElement[] {
    if (!core.editor) return [];
    return Array.from((core.editor.view.dom as HTMLElement).children) as HTMLElement[];
  }

  // Takes an id: the selected overlay acts on `selected.id`, not the hovered block's.
  function moveBlock(id: string, dir: -1 | 1) {
    if (core.editor) moveBlockById(core.editor, id, dir);
    hover.clear();
  }

  // Starts collapsed on small viewports, where it overlays the content.
  let blockSettingsOpen = $state(true);

  onMount(() => {
    scheme.startPreview();
    if (typeof window !== 'undefined' && window.matchMedia(COMPACT_CHROME_MEDIA).matches) {
      blockSettingsOpen = false;
    }
    // Hides the hover overlay while editing.
    core.onActivity = hover.onActivity;
    editing.mount(element!);
    window.addEventListener('keydown', onGlobalKeydown);
  });

  onDestroy(() => {
    core.destroy();
    if (typeof window !== 'undefined') {
      drag.destroy();
      window.removeEventListener('keydown', onGlobalKeydown);
    }
  });

  reportLockLost(core, () => lockLost, (json, dirty, held) => onLockLost?.(json, dirty, held));

  // A columns page's content is sections, so its "add" adds sections.
  const columnsMode = $derived(!!pageColumnsOf(core.page.layout));
  const insert = insertCommands(() => core.editor, { columnsMode: () => columnsMode, onQuickLink: openRetarget });

  function addBlock() {
    if (!core.editor) return;
    appendBlock(core.editor, columnsMode);
    requestAnimationFrame(() => {
      if (!core.editor || !shell) return;
      const els = blockEls();
      const last = els[els.length - 1];
      if (!last) return;
      const shellRect = shell.getBoundingClientRect();
      const r = last.getBoundingClientRect();
      flashBox = { top: r.top - shellRect.top, left: r.left - shellRect.left, width: r.width, height: r.height };
      setTimeout(() => { flashBox = null; }, 800);
    });
  }

  function openRetarget(id: string) {
    core.links.beginRetarget(id);
    overlays.propertyPicker = false;
    overlays.linkPicker = true;
  }

  function deleteBlock(id: string) {
    if (core.editor) deleteBlockById(core.editor, id);
    hover.clear();
  }
</script>

<div class="editor-app">
{#if lockLost}
  <Alert tone="danger" layout="banner">{m.editor_lock_lost_banner()}</Alert>
{/if}
{#if core.loadFailed}
  <Alert tone="danger" layout="banner">{m.editor_load_failed()}</Alert>
{/if}
<div class="editor-head">
<EditorHeader
  {title}
  {slug}
  {namespaceSlug}
  {onRename}
  tags={meta.tags}
  onSetTags={meta.commitTags}
  {tagSuggestions}
  bind:accessControlOpen={overlays.accessControl}
  bind:moreOpen={overlays.more}
  bind:tagsPopoverOpen={overlays.tags}
  bind:pagePropertiesDialogOpen={overlays.pageProperties}
  bind:blockSettingsOpen
  {lockLost}
  onRequestDelete={deletion.ask}
  onRequestContentScheme={onSetContentScheme ? () => (overlays.contentScheme = true) : undefined}
/>
  <EditorToolbar
    {core}
    {overlays}
    {insert}
    enabledPlugins={enabledPluginSet}
    linkNamespace={pickerNamespace(namespaces, namespaceId)}
    {locale}
    {propertyGroups}
    {propSuggestions}
    {images}
    save={editing.save}
    {scheme}
    {blockSettingsOpen}
    onDeleteCurrentBlock={() => core.editor && deleteBlockById(core.editor, currentBlock(core.editor)?.id ?? '')}
  />
  <input bind:this={images.input} type="file" accept={IMAGE_ACCEPT.desktop} hidden onchange={images.onPicked} />

</div>

<div class="editor-body">
<div class="editor-scroll">
<div class="editor-col">
<!-- role="presentation": a decorative hover layer. The hover tools are the
  mouse's; the selected block's tools offer the same to the keyboard. -->
<div class="editor-shell" role="presentation" bind:this={shell} onpointermove={hover.move} onpointerleave={hover.leave}>
  <CanvasOverlay
    {core}
    {hover}
    selectedBox={selectedBox.box}
    {drag}
    {moveBlock}
    {blockEdit}
    {deleteBlock}
    {quickLinkEmbed}
    embedQuickLink={embedQuickLinkBlock}
  />
  {#if drag.dragging && drag.dropLine}
    <div class="drop-line" class:invalid={!drag.dropValid} style="top:{drag.dropLine.top}px; left:{drag.dropLine.left}px; width:{drag.dropLine.width}px"></div>
  {/if}
  {#if flashBox}
    <div
      class="block-flash"
      style="top:{flashBox.top}px; left:{flashBox.left}px; width:{flashBox.width}px; height:{flashBox.height}px"
    ></div>
  {/if}
  <EditorCanvas page={core.page} firstBlockBleeds={core.firstBlockBleeds} scheme={scheme.attr} {locale} class={vpClass} bind:element />
  {#if core.loadFailed}
    <!-- No editor, nothing to append to. -->
  {:else if columnsMode}
    <!-- ui-check-allow: raw-element — the same append strip; on a columns page it adds a section -->
    <button class="add-block" onclick={addBlock} title={m.editor_add_section()}>＋ {m.editor_add_section_label()}</button>
  {:else}
    <!-- ui-check-allow: raw-element — the canvas's full-width dashed append strip, a drop-zone-shaped target, not a button look -->
    <button class="add-block" onclick={addBlock} title={m.editor_add_text_block()} aria-label={m.editor_add_text_block()}>＋</button>
  {/if}
  <PlaceholderInsertMenu commands={insert} enabledPlugins={enabledPluginSet} />
</div>
</div>
</div>
{#if blockSettingsOpen}
<!-- ui-check-allow: raw-element — the full-area backdrop behind the small-screen block settings panel; tapping it closes the panel -->
<button class="block-settings-backdrop" aria-label={m.editor_block_settings_backdrop_close()} onclick={() => (blockSettingsOpen = false)}></button>
<BlockSettings {core} pageId={pageId ?? null} namespace={pickerNamespace(namespaces, namespaceId)} enabledPlugins={enabledPluginSet} {quickLinkEmbed} onEmbedQuickLink={embedQuickLinkBlock} contentScheme={scheme.resolved} {images} onRetarget={openRetarget} {overlays} />
{/if}
</div>

<BlockEditDialogs edit={blockEdit} {propSuggestions} {namespaces} {users} {nodeClasses} {tagSuggestions} />

<PageDialogs
  {core}
  {meta}
  {overlays}
  {deletion}
  {namespaceAccessLevel}
  {namespaceMembers}
  {users}
  {shareLinks}
  {onCreateShareLink}
  {onRevokeShareLink}
  {namespaceId}
  {namespaces}
  {onSetNamespace}
  {contentScheme}
  {contentSchemeDefault}
  {onSetContentScheme}
  {isHomePage}
  {propSuggestions}
  {propertyGroups}
  {nodeClassId}
  {nodeClasses}
  {onSetNodeClass}
  {locale}
  {onSetLocale}
  {classFields}
/>
</div>

<style>
  .editor-app { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--ds-color-bg); z-index: 1; }
  .editor-head { flex: 0 0 auto; position: relative; background: var(--ds-color-bg); border-bottom: 1px solid var(--ds-color-border); box-shadow: var(--ds-shadow-sm); }
  .editor-body { flex: 1 1 auto; display: flex; min-height: 0; position: relative; }
  .editor-scroll { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
  /* Only on small screens, where the block settings panel overlays the content. */
  .block-settings-backdrop { display: none; border: 0; }
  @media (max-width: 768px) {
    .block-settings-backdrop { display: block; position: absolute; inset: 0; z-index: 29; background: var(--ds-color-scrim); }
  }
  .editor-col { max-width: none; margin: 0; padding: 1.75rem 0 6rem; }
  .editor-shell :global(.page-canvas) { border: 1px dashed var(--ds-color-border-hover); border-radius: var(--ds-radius-sm); }
  /* Room for the hover chrome, which sits above its block. */
  .editor-shell { position: relative; padding-top: 1.5rem; }
  .drop-line { position: absolute; left: 0; right: 0; height: 2px; background: var(--ds-color-accent); border-radius: 2px; z-index: 3; pointer-events: none; box-shadow: 0 0 0 1px var(--ds-color-bg); }
  .drop-line.invalid { background: var(--ds-color-danger); opacity: 0.5; }
  .editor-shell :global(.block-dragging) { opacity: 0.4; }
  /* Positions the grid's construction handles over the row. */
  .editor-shell :global(.grid-block) { position: relative; }
  .editor-shell :global(.grid-cell) { outline: 1px dashed var(--ds-color-border); min-height: 2.75rem; }
  /* A single-cell layout is a band, one surface as on the published view. */
  .editor-shell :global(.grid-cell:only-child) { outline: none; }
  /* A flex cell is sized by its content (flex.css); the min-width floor stands
     in for its content minimum when a row is short of room. */
  .editor-shell :global(.flex-cell) { outline: 1px dashed var(--ds-color-border); min-height: 2.75rem; }
  /* Not for a cell that sizes itself (Flex cell), so Fill and Fixed measure
     as they do on the page. */
  .editor-shell :global(.flex-cell:not(.cap-flex-item)) { min-width: 2.75rem; }
  .editor-shell :global(.flex-cell:only-child) { outline: none; }
  /* The containing block of the table's resize handles. */
  .editor-shell :global(.table-block) { position: relative; }
  .editor-shell :global(.table-block-content-wrap) { position: relative; }
  .add-block { display: flex; align-items: center; justify-content: center; width: 100%; min-height: var(--ds-target-min); margin-top: 0.4rem; padding: 0.45rem; border: 1px dashed var(--ds-color-border); border-radius: var(--ds-radius-sm); background: none; color: var(--ds-color-muted); cursor: pointer; font-size: 1.1rem; line-height: 1; }
  .add-block:hover { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-color: var(--ds-color-accent); }
  .block-flash { position: absolute; pointer-events: none; border-radius: var(--ds-radius-sm); z-index: 2; animation: blockflash 0.8s ease-out forwards; }
  @keyframes blockflash {
    from { background: color-mix(in srgb, var(--ds-color-accent) 20%, transparent); }
    to { background: transparent; }
  }
  /* The placeholder's hint is a zero-height float, so the caret sits at its
     start, and an empty flex cell asks for the whole hint yet still shrinks.
     overflow-x: clip, not hidden, so the other axis stays visible. */
  .editor-shell :global(.ph-row) { display: flex; align-items: center; gap: 0.4rem; min-height: 2rem; }
  .editor-shell :global(.ph-content) { flex: 1 1 auto; min-width: 0; }
  .editor-shell :global(.ph-content[data-empty]::before) {
    content: attr(data-hint);
    float: left; height: 0; max-width: 100%;
    white-space: nowrap; overflow-x: clip; overflow-y: visible; text-overflow: ellipsis;
    color: var(--ds-color-muted); pointer-events: none;
  }
  .editor-shell :global(.ph-plus) {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    width: 1.4rem; height: 1.4rem; padding: 0; border: 1px dashed var(--ds-color-border); border-radius: var(--ds-radius-sm);
    background: none; color: var(--ds-color-muted); cursor: pointer; font-size: 0.9rem; line-height: 1;
  }
  .editor-shell :global(.ph-plus:hover) { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-color: var(--ds-color-accent); }
  /* Inset, like every other indicator: a full-width image's box spans the
     canvas, so an outward ring would overflow the scroll container. */
  .editor-shell :global(.page-image-frame.ProseMirror-selectednode .page-image) {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  /* Positions the image's resize grip. */
  .editor-shell :global(.page-image-frame) { position: relative; }
</style>
