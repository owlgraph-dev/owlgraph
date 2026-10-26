<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A target's capability sections, each wired to where the host keeps it: the
  // page, a query block (its result container's format options), a flex row,
  // any other block or cell.
  import * as m from '$lib/paraglide/messages';
  import { blockSupportsCapability, pageGutterPx, setPageGutter, setLayoutField, setLayoutArrangement, setSpacingField, setSurfaceField, queryFormat, setTemplateFormatOption, TEMPLATE_RESULT_LAYOUT_DEFAULTS, defaultsFor, getBlockDefaults, NO_DEFAULTS, pageRhythmPx, resolvedSpace, clearTier, FLOW_BLOCK_TYPES, editTier, backgroundContrast, contrastWarningText, clearSurfaceImage, SURFACE_IMAGE_TYPES, type HeightData } from '$lib/features/content';
  import type { ContentScheme } from '$lib/features/content';
  import type { SelectionChainEntry } from '$lib/features/content/editor';
  import { PAGE_TYPE, applyPageColumns, moveBlockInSections, setBlockAttrsById, type sectionMovesAt } from '$lib/features/content/editor';
  import { imagePlacement, gridTierAttrs, withGridTierColumns, withGridTierGap, type PageColumns, type PlacementData, type PlacementKind, type FlexItemData } from '$lib/features/content';
  import { getPageLayoutPresets } from '$lib/features/pages';
  import { toast } from '$lib/design-system';
  import type { Editor } from '@tiptap/core';
  import { blockDefaultsOf, placementKindOf, surfaceFieldsOf } from '../blocks/catalog';
  import LayoutSection from './LayoutSection.svelte';
  import SpacingSection from './SpacingSection.svelte';
  import SurfaceSection from './SurfaceSection.svelte';
  import PageLayoutSection from './PageLayoutSection.svelte';
  import PageSurfaceSection from './PageSurfaceSection.svelte';
  import AlignmentSection from './AlignmentSection.svelte';
  import PlacementSection from './PlacementSection.svelte';
  import FlexCellSection from './FlexCellSection.svelte';
  import { capabilitySupport, spacingRowsFor, placementRowsFor, type capabilitySectionsFor } from './sections';
  import type { Target } from './types';

  let {
    target,
    editor,
    chain,
    selectedIndex,
    sections,
    moves,
    contentScheme,
    surfaceUploading,
    onPickSurfaceImage,
    onOverlayOpenChange,
  }: {
    target: Target;
    editor: Editor | null;
    chain: SelectionChainEntry[];
    selectedIndex: number;
    /** The sections the target shows, in their order (sections.ts). */
    sections: ReturnType<typeof capabilitySectionsFor>;
    /** The target's moves in its section; null where it isn't directly in a section's cell. */
    moves: ReturnType<typeof sectionMovesAt> | null;
    /** The page's content scheme: which schemes a colour must read in. */
    contentScheme: ContentScheme;
    /** Whether a background image picked here is still uploading. */
    surfaceUploading: boolean;
    /** Opens the editor's image picker for the target's background image. */
    onPickSurfaceImage: () => void;
    /** True while a section's popover or menu is open. */
    onOverlayOpenChange: (open: boolean) => void;
  } = $props();

  const spacingRows = $derived(
    target && editor
      ? spacingRowsFor(capabilitySupport((cap) => blockSupportsCapability(editor, target.type, cap), target.type, target.attrs), target.type)
      : { blockSpace: false, spaceAbove: false, pad: false }
  );

  const placementRows = $derived(
    target && editor
      ? placementRowsFor((cap) => blockSupportsCapability(editor, target.type, cap), target.type, target.attrs, !!moves)
      : { moves: false, align: false }
  );
  const bgWarning = $derived(
    contrastWarningText(backgroundContrast(chain.slice(0, selectedIndex + 1).map((e) => ({ type: e.type, attrs: e.attrs })), $editTier, contentScheme))
  );

  // The content follows a new page layout or column count in one undo step;
  // trailing columns merged into the last that stays are announced.
  function applyColumns(next: PageColumns | null) {
    if (!editor) return;
    const merges = applyPageColumns(editor, next);
    if (merges.length === 0) return;
    const from = [...new Set(merges.flatMap((mg) => mg.from))].sort((a, b) => a - b).join(', ');
    toast.info(m.editor_page_columns_merged({ from, into: merges[0].into, count: merges.length }));
  }

  // What the target's capabilities resolve to when it sets nothing: the value
  // every Auto row shows. A kind may resolve its own: a quick-link card its
  // variant's fields only, the query block its result container's.
  const targetDefaults = $derived.by(() => {
    if (!target) return NO_DEFAULTS;
    return blockDefaultsOf(target.type, target.attrs, defaultsFor(target.type, getBlockDefaults()), getBlockDefaults());
  });
  // The nearest ancestor flow's own rhythm, else the page rhythm: the chain
  // the CSS resolves through (docs/architecture/blocks/capabilities.md).
  const inheritedRhythm = $derived.by(() => {
    for (let i = selectedIndex - 1; i >= 0; i--) {
      const entry = chain[i];
      if (!entry || !(entry.type === PAGE_TYPE || FLOW_BLOCK_TYPES.has(entry.type))) continue;
      const attrs = (entry.attrs ?? {}) as Record<string, any>;
      const spacing = entry.type === 'queryBlock' ? attrs.formatOptions?.spacing : attrs.spacing;
      const own = resolvedSpace(spacing, $editTier, 'blockSpace');
      if (own != null) return own;
    }
    return pageRhythmPx(getBlockDefaults());
  });
  // The site's gutter per tier (capability defaults), shown as Auto.
  const siteGutters = $derived({
    desktop: pageGutterPx(getBlockDefaults(), 'desktop'),
    tablet: pageGutterPx(getBlockDefaults(), 'tablet'),
    phone: pageGutterPx(getBlockDefaults(), 'phone'),
  });
  // A capability bag that sets nothing is stored as nothing.
  const orNull = <T extends object>(data: T): T | null => (Object.keys(data).length > 0 ? data : null);

  // An image moves within its frame and clears its one-value align in the
  // same write; a quick link fills when stretched; any other block is a box.
  function placementControl(t: Target): { value: PlacementData | null | undefined; kind: PlacementKind; onChange: (next: PlacementData) => void } {
    if (t.type === 'image') {
      return {
        kind: 'image',
        value: imagePlacement(t.attrs),
        onChange: (next) => { if (editor && t.id) setBlockAttrsById(editor, t.id, { placement: orNull(next), align: null }); },
      };
    }
    return { kind: placementKindOf(t.type), value: t.attrs.placement, onChange: (next) => t.update({ placement: orNull(next) }) };
  }
</script>

{#each sections as s (s)}
  {#if s === 'layout'}
    {#if target.type === PAGE_TYPE}
      <PageLayoutSection
        value={target.attrs.layout}
        presets={getPageLayoutPresets()}
        siteWidths={getBlockDefaults().page.widths}
        onChange={(next) => target.update({ layout: next })}
        onColumns={applyColumns}
        {onOverlayOpenChange}
      />
    {:else if target.type === 'queryBlock'}
      {@const fmt = queryFormat(target.attrs.format)}
      <LayoutSection
        width={{ value: target.attrs.width ?? 'normal', onChange: (v) => target.update({ width: v }) }}
        bleed={{ value: !!target.attrs.bleedToTop, onChange: (v) => target.update({ bleedToTop: v }) }}
        flex={fmt.capabilities.includes('layout')
          ? {
              value: target.attrs.formatOptions?.layout,
              defaults: TEMPLATE_RESULT_LAYOUT_DEFAULTS,
              onChange: (field, v) => target.update({ formatOptions: setTemplateFormatOption(target.attrs.formatOptions, 'layout', setLayoutField(target.attrs.formatOptions?.layout, $editTier, field, v)) }),
              onArrange: (a) => target.update({ formatOptions: setTemplateFormatOption(target.attrs.formatOptions, 'layout', setLayoutArrangement(target.attrs.formatOptions?.layout, $editTier, a)) }),
            }
          : undefined}
        info={m.editor_block_settings_query_result_layout_hint()}
      />
    {:else if target.type === 'flexContainer'}
      <LayoutSection
        width={{ value: target.attrs.width ?? 'normal', onChange: (v) => target.update({ width: v }) }}
        bleed={{ value: !!target.attrs.bleedToTop, onChange: (v) => target.update({ bleedToTop: v }) }}
        height={{ value: target.attrs.height, onChange: (next: HeightData) => target.update({ height: orNull(next) }) }}
        flex={editor && blockSupportsCapability(editor, 'flexContainer', 'layout')
          ? {
              value: target.attrs.layout,
              onChange: (field, v) => target.update({ layout: setLayoutField(target.attrs.layout, $editTier, field, v) }),
              onArrange: (a) => target.update({ layout: setLayoutArrangement(target.attrs.layout, $editTier, a) }),
            }
          : undefined}
      />
    {:else}
      <LayoutSection
        width={{ value: target.attrs.width ?? 'normal', onChange: (v) => target.update({ width: v }) }}
        bleed={{ value: !!target.attrs.bleedToTop, onChange: (v) => target.update({ bleedToTop: v }) }}
        height={editor && blockSupportsCapability(editor, target.type, 'height')
          ? { value: target.attrs.height, onChange: (next: HeightData) => target.update({ height: orNull(next) }) }
          : undefined}
        grid={target.type === 'grid'
          ? {
              attrs: target.attrs,
              // A new desktop structure or gap re-validates the smaller tiers against it (gridColumns.ts).
              onWidths: (arr) => target.update({ columnWidths: arr, ...gridTierAttrs({ ...target.attrs, columnWidths: arr }) }),
              onTierColumns: (tier, ratios) => target.update({ columnsByTier: withGridTierColumns(target.attrs, tier, ratios) }),
              onGap: (bp, step) =>
                bp === 'desktop'
                  ? target.update({ gap: step, gapByTier: gridTierAttrs({ ...target.attrs, gap: step }).gapByTier })
                  : target.update({ gapByTier: withGridTierGap(target.attrs, bp, step) }),
            }
          : undefined}
      />
    {/if}
  {:else if s === 'spacing'}
    {#if target.type === 'queryBlock'}
      <SpacingSection
        value={target.attrs.formatOptions?.spacing}
        defaultPad={targetDefaults.pad}
        {inheritedRhythm}
        rows={spacingRows}
        onChange={(field, v) => target.update({ formatOptions: setTemplateFormatOption(target.attrs.formatOptions, 'spacing', setSpacingField(target.attrs.formatOptions?.spacing, $editTier, field, v)) })}
        onReset={() => target.update({ formatOptions: setTemplateFormatOption(target.attrs.formatOptions, 'spacing', clearTier(target.attrs.formatOptions?.spacing, $editTier)) })}
        {onOverlayOpenChange}
      />
    {:else if target.type === PAGE_TYPE}
      <SpacingSection
        value={target.attrs.spacing}
        defaultPad={targetDefaults.pad}
        {inheritedRhythm}
        rows={spacingRows}
        gutter={{ value: target.attrs.layout, site: siteGutters, onChange: (g) => target.update({ layout: setPageGutter(target.attrs.layout, $editTier, g) }) }}
        onChange={(field, v) => target.update({ spacing: setSpacingField(target.attrs.spacing, $editTier, field, v) })}
        onReset={() => target.update({ spacing: clearTier(target.attrs.spacing, $editTier), layout: setPageGutter(target.attrs.layout, $editTier, null) })}
        {onOverlayOpenChange}
      />
    {:else}
      <SpacingSection
        value={target.attrs.spacing}
        defaultPad={targetDefaults.pad}
        {inheritedRhythm}
        rows={spacingRows}
        onChange={(field, v) => target.update({ spacing: setSpacingField(target.attrs.spacing, $editTier, field, v) })}
        onReset={() => target.update({ spacing: clearTier(target.attrs.spacing, $editTier) })}
        {onOverlayOpenChange}
      />
    {/if}
  {:else if s === 'surface'}
    {#if target.type === PAGE_TYPE}
      <PageSurfaceSection value={target.attrs.surface} onChange={(next) => target.update({ surface: next })} {onOverlayOpenChange} />
    {:else if target.type === 'queryBlock'}
      <SurfaceSection
        value={target.attrs.formatOptions?.surface}
        defaults={targetDefaults}
        {bgWarning}
        onChange={(field, v) => target.update({ formatOptions: setTemplateFormatOption(target.attrs.formatOptions, 'surface', setSurfaceField(target.attrs.formatOptions?.surface, $editTier, field, v)) })}
        onReset={() => target.update({ formatOptions: setTemplateFormatOption(target.attrs.formatOptions, 'surface', clearTier(target.attrs.formatOptions?.surface, $editTier)) })}
        {onOverlayOpenChange}
      />
    {:else}
      <SurfaceSection
        value={target.attrs.surface}
        fields={[...surfaceFieldsOf(target.type, target.attrs)]}
        defaults={targetDefaults}
        {bgWarning}
        image={SURFACE_IMAGE_TYPES.has(target.type)
          ? {
              key: `${target.type}:${chain[selectedIndex]?.pos}`,
              onPick: onPickSurfaceImage,
              uploading: surfaceUploading,
              onClear: () => target.update({ surface: clearSurfaceImage(target.attrs.surface) }),
            }
          : undefined}
        onChange={(field, v) => target.update({ surface: setSurfaceField(target.attrs.surface, $editTier, field, v) })}
        onReset={() => target.update({ surface: clearTier(target.attrs.surface, $editTier) })}
        {onOverlayOpenChange}
      />
    {/if}
  {:else if s === 'placement'}
    <PlacementSection
      moves={placementRows.moves ? moves : null}
      onMove={(move) => { if (editor && target.id) moveBlockInSections(editor, target.id, move); }}
      align={placementRows.align ? placementControl(target) : undefined}
    />
  {:else if s === 'alignment'}
    <AlignmentSection {target} />
  {:else if s === 'flexItem'}
    <FlexCellSection value={target.attrs.flexItem} onChange={(next: FlexItemData) => target.update({ flexItem: orNull(next) })} />
  {/if}
{/each}

