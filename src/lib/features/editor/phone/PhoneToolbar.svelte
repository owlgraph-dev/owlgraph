<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The phone's tool strip and its sheets. It reads the editor core and
  // writes through it; only pure block operations (setBlockAttrsById) are
  // imported directly.
  import { Button, BottomSheet, BottomSheetItem, Badge, FormField, Input } from '$lib/design-system';
  import { NodePicker, type NodePickerCreate } from '$lib/features/search/picker';
  import { linkPickerRows } from '../shared/linkPickerRows';
  import { IMAGE_ACCEPT } from '../desktop/imagePicker.svelte';
  import TypographyField from '../capabilities/typography/TypographyField.svelte';
  import TypographyMarkFields from '../capabilities/typography/TypographyMarkFields.svelte';
  import { resolveParagraphStyle, PARAGRAPH_STYLE_TEXTBLOCKS, editTier } from '$lib/features/content';
  import { getTypographyRegistry } from '$lib/features/content';
  import type { LinkResult } from '../core/links.svelte';
  import type { EditorCore } from '../core/editorCore.svelte';
  import type { SaveAction } from '../session/saveAction.svelte';
  import type { CanvasScheme } from '../shared/canvasScheme.svelte';
  import { setBlockAttrsById } from '$lib/features/content/editor';
  import type { SitePage } from '../shared/sitePages';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';

  let {
    core,
    save,
    scheme,
    linkNamespace = null,
    locale,
    onDeleteBlock = null,
    onBlockSettings = null,
  }: {
    core: EditorCore;
    save: SaveAction;
    /** The canvas's scheme, which a typography colour must read in. */
    scheme: CanvasScheme;
    /** The page's namespace, where the link picker makes a page it is asked for. */
    linkNamespace?: NodePickerCreate['namespace'] | null;
    /** The content language a site page's card is labelled in. */
    locale?: string;
    /** Removes the selected block; null while nothing removable is selected. */
    onDeleteBlock?: (() => void) | null;
    /** Opens the selected block's settings sheet; null while the selected block has none on a phone. */
    onBlockSettings?: (() => void) | null;
  } = $props();

  const format = $derived(core.format);
  const target = $derived(core.selection.textTarget);
  /** The inline named styles this site offers (docs/architecture/custom-styles.md). */
  const customStyles = $derived(format.customStyleOptions());
  /** The site's paragraph styles, in hierarchy order (docs/architecture/typography.md). */
  const paragraphStyles = $derived(format.paragraphStyleOptions());
  /** Whether the typography colour reads on its background (contrastGuidance.ts). */
  const typoColorWarning = $derived(format.colorWarning(scheme.resolved));

  let typographyOpen = $state(false);
  // Named in the sheet, so an upright and a sideways phone don't silently
  // edit different tiers.
  const TIER_LABEL = { desktop: m.editor_phone_tier_desktop, tablet: m.editor_phone_tier_tablet, phone: m.editor_phone_tier_phone };
  let paragraphStyleOpen = $state(false);
  const paragraphStyleTarget = $derived(!!target && PARAGRAPH_STYLE_TEXTBLOCKS.has(target.type));

  let customStyleOpen = $state(false);
  let linkSheetOpen = $state(false);

  function openLinkSheet() {
    core.links.begin();
    linkSheetOpen = true;
  }
  function closeLinkSheet() {
    linkSheetOpen = false;
    core.links.end();
  }
  function choosePickAndClose(r: LinkResult) {
    core.links.choosePick(r);
    closeLinkSheet();
  }
  function placeSitePageAndClose(page: SitePage) {
    core.links.placeSitePage(page, locale);
    closeLinkSheet();
  }
  function insertUrlCardAndClose(url: string) {
    core.links.insertUrlCard(url);
    closeLinkSheet();
  }

  let fileInput = $state<HTMLInputElement | null>(null);
  let imageAltOpen = $state(false);
  let imageAltTargetId: string | null = null;
  let imageAltValue = $state('');

  function pickImage() {
    fileInput?.click();
  }
  async function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const id = await core.insertUploadedImage(file);
    if (id) {
      imageAltTargetId = id;
      imageAltValue = '';
      imageAltOpen = true;
    }
  }
  function commitImageAlt() {
    if (imageAltTargetId && core.editor) setBlockAttrsById(core.editor, imageAltTargetId, { alt: imageAltValue });
    imageAltOpen = false;
    imageAltTargetId = null;
  }
</script>

<!-- The tools scroll sideways in a strip of their own (44px each on touch
     don't fit a phone's width); Save stays pinned at the end. -->
<div class="m-toolbar">
  <div class="m-tools scroll-cue">
    {#if onDeleteBlock}<Button variant="ghost-danger" size="sm" icon title={m.editor_block_tools_delete()} aria-label={m.editor_block_tools_delete()} onclick={onDeleteBlock}><Icon name="trash" /></Button>{/if}
    {#if onBlockSettings}<Button variant="ghost" size="sm" icon title={m.editor_phone_block_settings()} aria-label={m.editor_phone_block_settings()} onclick={onBlockSettings}><Icon name="settings" /></Button>{/if}
    <Button variant="ghost" size="sm" icon active={format.boldActive} aria-pressed={format.boldActive} title={m.editor_toolbar_bold()} aria-label={m.editor_toolbar_bold()} onclick={format.toggleBold}><Icon name="bold" /></Button>
    <Button variant="ghost" size="sm" icon active={format.active.italic} aria-pressed={format.active.italic} title={m.editor_toolbar_italic()} aria-label={m.editor_toolbar_italic()} onclick={() => core.editor?.chain().focus().toggleItalic().run()}><Icon name="italic" /></Button>
    <Button variant="ghost" size="sm" icon active={paragraphStyleOpen} disabled={!paragraphStyleTarget} title={m.editor_paragraph_style_label()} aria-label={m.editor_paragraph_style_label()} onclick={() => (paragraphStyleOpen = true)}><Icon name="heading" /></Button>
    <Button variant="ghost" size="sm" icon active={typographyOpen} title={m.editor_phone_typography_trigger()} aria-label={m.editor_phone_typography_trigger()} onclick={() => (typographyOpen = true)}><Icon name="type" /></Button>
    <Button variant="ghost" size="sm" icon active={customStyleOpen || !!format.customStyleId} title={m.editor_phone_custom_style_trigger()} aria-label={m.editor_phone_custom_style_trigger()} onclick={() => (customStyleOpen = true)}><Icon name="sliders" /></Button>
    <Button variant="ghost" size="sm" icon active={linkSheetOpen} title={m.editor_link_picker_title()} aria-label={m.editor_link_picker_aria()} onclick={openLinkSheet}><Icon name="link" /></Button>
    <Button variant="ghost" size="sm" icon title={m.editor_toolbar_insert_image()} aria-label={m.editor_toolbar_insert_image()} onclick={pickImage}><Icon name="image" /></Button>
  </div>
  <input bind:this={fileInput} type="file" accept={IMAGE_ACCEPT.phone} class="m-file-input" onchange={onFilePicked} />
  {#if save.savedAt}<span class="m-saved">{m.editor_toolbar_saved({ time: save.savedAt })}</span>{/if}
  <Button variant="primary" size="sm" onclick={save.run} disabled={save.saving}>{save.saving ? m.editor_toolbar_saving() : m.editor_toolbar_save()}</Button>
</div>

<!-- Label and tag, no styled preview: the sheet portals outside the canvas. -->
<BottomSheet bind:open={paragraphStyleOpen} title={m.editor_paragraph_style_label()}>
  {#each paragraphStyles as style (style.id)}
    <BottomSheetItem
      onclick={() => { format.setParagraphStyle(style.id); paragraphStyleOpen = false; }}
      active={format.paragraphStyleId === style.id}
    ><span class="m-bs-row"><span>{style.label}</span><span class="m-bs-tag">{style.renderAs}</span></span></BottomSheetItem>
  {/each}
</BottomSheet>

<BottomSheet bind:open={typographyOpen} title={m.editor_phone_typography_sheet_title()}>
  {#if format.blockScope && target}
    <p class="m-tier">{m.editor_block_settings_breakpoint_label()} <Badge>{TIER_LABEL[$editTier]()}</Badge></p>
    <TypographyField
      value={target.attrs.typography}
      defaults={resolveParagraphStyle(target.type, target.attrs, getTypographyRegistry().paragraphStyles).defaults}
      colorWarning={typoColorWarning}
      innerColors={format.inlineColors}
      onChange={format.setField}
    />
  {:else}
    <TypographyMarkFields value={format.markValue} mixed={format.markMixed} colorWarning={typoColorWarning} onChange={format.setField} />
  {/if}
</BottomSheet>

<!-- No styled preview: the compiled rules are scoped to the page canvas, and
     a sheet portals outside it (docs/architecture/custom-styles.md). -->
<BottomSheet bind:open={customStyleOpen} title={m.editor_phone_custom_style_sheet_title()}>
  {#if customStyles.length === 0}
    <p class="m-cs-empty">{m.editor_custom_style_empty()}</p>
  {:else}
    {#if format.customStyleMixed}<p class="m-cs-empty">{m.editor_custom_style_mixed()}</p>{/if}
    <BottomSheetItem
      onclick={() => { format.setCustomStyle(null); customStyleOpen = false; }}
      active={!format.customStyleMixed && format.customStyleId === null}
    >{m.editor_custom_style_none()}</BottomSheetItem>
    {#each customStyles as style (style.id)}
      <BottomSheetItem
        onclick={() => { format.setCustomStyle(style.id); customStyleOpen = false; }}
        active={format.customStyleId === style.id}
      >{style.label}</BottomSheetItem>
    {/each}
  {/if}
</BottomSheet>

<NodePicker
  open={linkSheetOpen}
  onOpenChange={(o) => {
    if (!o) closeLinkSheet();
  }}
  title={m.editor_link_picker_title()}
  placeholder={core.links.retargetId ? m.editor_link_picker_placeholder_retarget() : m.editor_link_picker_placeholder()}
  types={['page', 'document']}
  rowAction={m.editor_link_picker_action()}
  recent={6}
  create={linkNamespace ? { types: ['page'], namespace: linkNamespace } : undefined}
  leading={(term) => linkPickerRows(term, { retargeting: !!core.links.retargetId, insertUrlCard: insertUrlCardAndClose, placeSitePage: placeSitePageAndClose })}
  note={core.links.retargetId ? m.editor_link_picker_hint_retarget() : m.editor_link_picker_hint_default()}
  onPick={(node) => {
    if (node.type !== 'collection') choosePickAndClose({ type: node.type, id: node.id, slug: node.slug, title: node.title });
  }}
/>

<BottomSheet bind:open={imageAltOpen} title={m.editor_toolbar_insert_image()}>
  <div class="m-alt">
    <FormField label={m.editor_block_settings_image_alt_label()}>
      <Input size="lg" placeholder={m.editor_block_settings_image_alt_placeholder()} bind:value={imageAltValue} />
    </FormField>
  </div>
  <Button variant="primary" size="sm" onclick={commitImageAlt}>{m.editor_properties_dialog_done()}</Button>
</BottomSheet>

<style>
  .m-cs-empty {
    margin: 0 0 var(--ds-space-sm);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .m-toolbar {
    position: fixed;
    left: 0;
    right: 0;
    /* Rides on the on-screen keyboard while one is up (--ds-keyboard-inset):
       the formatting tools are for the text being typed. */
    bottom: var(--ds-keyboard-inset, 0px);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
    background: var(--ds-color-bg);
    border-top: 1px solid var(--ds-color-border);
  }
  /* No scroll snapping: snapped, the strip re-snaps to its first tool when
     delete appears in front of it, and pushes delete out of view. */
  .m-tools { display: flex; flex: 1 1 auto; align-items: center; gap: 0.25rem; min-width: 0; overflow-x: auto; }
  .m-tools > :global(*) { flex-shrink: 0; }
  .m-tier { display: flex; align-items: center; gap: var(--ds-space-sm); margin: 0 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .m-saved { font-size: 0.8rem; color: var(--ds-color-muted); }
  .m-file-input { display: none; }

  .m-alt { margin-bottom: 0.75rem; }
  .m-bs-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ds-space-md); width: 100%; }
  .m-bs-tag { font-family: var(--ds-font-mono); font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
</style>
