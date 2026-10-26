<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Draws the hover and selection block tools, over the boxes the shell's
  // hover and selected box measure from the NodeView DOM.
  import { ToolbarButton, ToolbarGroup, ToolbarGroupItem, Toolbar as DsToolbar } from '$lib/design-system';
  import { addTableColumn, removeTableColumn, addTableRow, removeTableRow, toggleShowHeader as toggleTableHeader } from '$lib/features/content/editor';
  import { addContainerColumn, removeContainerColumn, addContainerRow, removeContainerRow, setGap as setContainerGap, mergeSelectFor } from '$lib/features/content/editor';
  import type { SpaceToken } from '$lib/features/content';
  import { addCell as addFlexCell, removeCell as removeFlexCell, insertSection, sectionMovesAt, moveBlockInSections } from '$lib/features/content/editor';
  import { shownMoves, moveTitle } from '../blockSettings/placementMoves';
  import { setFlexLayoutField, setSectionSpan } from '../commands/attrs';
  import { resolvedFlexDirection, resolvedFlexWrap, resolvedGap, resolvedGridGap, GAP_PRESETS, type LayoutData } from '$lib/features/content';
  import { editTier } from '$lib/features/content';
  import type { EditorCore } from '../core/editorCore.svelte';
  import type { Box } from '../shared/selectedBox.svelte';
  import type { BlockHover } from './hover.svelte';
  import type { BlockDrag } from './blockDrag.svelte';
  import type { BlockEdit } from './blockEdit.svelte';
  import { blockIsEditable } from '../blocks/catalog';
  import type { QuickLinkEmbed } from '../blockSettings/types';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';

  // A page section's one layout knob on the canvas is its span; its columns
  // are the page's. Named with the block settings panel's span control's words.
  const SPANS: { value: 'normal' | 'wide' | 'full'; icon: string; label: () => string }[] = [
    { value: 'normal', icon: 'width-read', label: m.section_width_normal },
    { value: 'wide', icon: 'width-wide', label: m.section_width_wide },
    { value: 'full', icon: 'width-full', label: m.section_width_full },
  ];
  function setSpan(pos: number, value: string) {
    if (editor) setSectionSpan(editor, pos, value);
  }
  function setFlexContainerLayoutField(pos: number, field: 'flexDirection' | 'flexWrap' | 'gap', value: string | number | null) {
    if (editor) setFlexLayoutField(editor, pos, $editTier, field, value);
  }

  const GAP_TOKENS: { token: SpaceToken; label: string }[] = [
    { token: 'none', label: '0' },
    { token: 'sm', label: 'S' },
    { token: 'md', label: 'M' },
    { token: 'lg', label: 'L' },
  ];

  let {
    core,
    hover,
    selectedBox,
    drag,
    moveBlock,
    blockEdit,
    deleteBlock,
    quickLinkEmbed,
    embedQuickLink,
  }: {
    core: EditorCore;
    hover: BlockHover;
    selectedBox: Box | null;
    drag: BlockDrag;
    moveBlock: (id: string, dir: -1 | 1) => void;
    blockEdit: BlockEdit;
    deleteBlock: (id: string) => void;
    /** What a quick link to a document can become (docs/architecture/blocks/node-embeds.md, "A quick link becomes a block"); null for any other block. */
    quickLinkEmbed: (attrs: Readonly<Record<string, unknown>>) => QuickLinkEmbed | null;
    embedQuickLink: (id: string) => void;
  } = $props();

  const editor = $derived(core.editor);
  const selected = $derived(core.selection.selected);
  const selectedIndex = $derived(core.selection.index);
  // The selected chain entry: a block, or a cell reached by select-parent.
  const entry = $derived(core.selection.chain[core.selection.index]);

  const embed = $derived(selected?.type === 'quickLink' ? quickLinkEmbed(selected.attrs) : null);

  // Re-read whenever the editor hands a new `selected` (after each
  // transaction), so the moves' enablement follows the document.
  const moves = $derived(editor && selected ? sectionMovesAt(editor, selected.id) : null);

  // The tools' rendered size: right-aligned to the block but never past the
  // overlay's left edge (a narrow block's toolbar is wider than the block).
  let hoverToolsW = $state(0);
  let hoverToolsH = $state(0);
  let selToolsW = $state(0);
  let selToolsH = $state(0);
  const toolsLeft = (box: { left: number; width: number }, w: number) => Math.max(0, box.left + box.width - w - 4);
  // In its top-right corner the grip would cover a narrow block (an empty
  // cell's "+" included), so below four grip widths it sits flush on the
  // block's top edge instead, where the overlay has room above.
  const hoverAbove = $derived(!!hover.box && hoverToolsW > 0 && hover.box.width < hoverToolsW * 4 && hover.box.top >= hoverToolsH);
  const hoverTop = $derived(hover.box ? (hoverAbove ? hover.box.top - hoverToolsH : hover.box.top + 4) : 0);
  const hoverLeft = $derived(hover.box ? (hoverAbove ? Math.max(0, hover.box.left + hover.box.width - hoverToolsW) : toolsLeft(hover.box, hoverToolsW)) : 0);
</script>

{#if hover.box && !hover.interacting && hover.id !== selected?.id}
  <div
    class="block-outline"
    style="top:{hover.box.top}px; left:{hover.box.left}px; width:{hover.box.width}px; height:{hover.box.height}px"
  ></div>
  <!-- Hover shows only the drag handle; every other tool needs the block selected. -->
  <div class="block-tools" bind:offsetWidth={hoverToolsW} bind:offsetHeight={hoverToolsH} style="top:{hoverTop}px; left:{hoverLeft}px">
    <DsToolbar class="block-tools-row" aria-label={m.editor_block_tools_aria()}>
      <ToolbarButton size="sm" class="bt-drag" title={m.editor_block_tools_drag_title()} aria-label={m.editor_block_tools_drag_aria()} onpointerdown={(e: PointerEvent) => hover.id && drag.start(hover.id, e)}><Icon name="grip" size={14} /></ToolbarButton>
    </DsToolbar>
  </div>
{/if}
{#if selectedBox}
  <div
    class="block-selected"
    style="top:{selectedBox.top}px; left:{selectedBox.left}px; width:{selectedBox.width}px; height:{selectedBox.height}px"
  ></div>
  {#if selectedIndex > 0 || selected}
    <!-- Above the block so it doesn't cover the content being edited; inside
      the corner when there's no room above. -->
    <div class="block-tools" bind:offsetWidth={selToolsW} bind:offsetHeight={selToolsH} style="top:{selectedBox.top > selToolsH + 4 ? selectedBox.top - selToolsH - 4 : selectedBox.top + 4}px; left:{toolsLeft(selectedBox, selToolsW)}px">
      <DsToolbar class="block-tools-row" aria-label={m.editor_block_tools_aria()}>
      {#if selected}
        <ToolbarButton size="sm" title={m.editor_block_tools_drag_title()} aria-label={m.editor_block_tools_drag_aria()} onpointerdown={(e: PointerEvent) => selected && drag.start(selected.id, e)}><Icon name="grip" size={14} /></ToolbarButton>
      {/if}
      {#if selectedIndex > 0}
        <ToolbarButton size="sm" title={m.editor_block_tools_select_parent_title()} aria-label={m.editor_block_tools_select_parent_aria()} onclick={() => core.selection.selectAncestor(selectedIndex - 1)}><Icon name="corner-up-left" size={14} /></ToolbarButton>
      {/if}
      {#if selected?.type === 'grid'}
        <ToolbarButton size="sm" title={core.selection.containerGuards?.canRemoveCol ? m.editor_block_tools_remove_column() : m.editor_block_tools_remove_column_hint_container()} aria-label={m.editor_block_tools_remove_column()} disabled={!core.selection.containerGuards?.canRemoveCol} onclick={() => editor && removeContainerColumn(editor, entry.pos)}><Icon name="column-minus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_add_column()} aria-label={m.editor_block_tools_add_column()} onclick={() => editor && addContainerColumn(editor, entry.pos)}><Icon name="column-plus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={core.selection.containerGuards?.canRemoveRow ? m.editor_block_tools_remove_row() : m.editor_block_tools_remove_row_hint_container()} aria-label={m.editor_block_tools_remove_row()} disabled={!core.selection.containerGuards?.canRemoveRow} onclick={() => editor && removeContainerRow(editor, entry.pos)}><Icon name="row-minus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_add_row()} aria-label={m.editor_block_tools_add_row()} onclick={() => editor && addContainerRow(editor, entry.pos)}><Icon name="row-plus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_merge_cells()} aria-label={m.editor_block_tools_merge_cells()} active={$mergeSelectFor === entry.id} onclick={() => mergeSelectFor.update((cur) => (cur === entry.id ? null : entry.id))}><Icon name="select-cells" size={14} /></ToolbarButton>
        <ToolbarGroup type="single" class="bt-group" value={resolvedGridGap(entry.attrs, $editTier)} onValueChange={(v) => { if (v && editor) setContainerGap(editor, entry.pos, v as SpaceToken, $editTier); }}>
          {#each GAP_TOKENS as g (g.token)}
            <ToolbarGroupItem size="sm" value={g.token} title={m.editor_block_tools_gap_named({ token: g.token })} aria-label={m.editor_block_tools_gap_named({ token: g.token })} onclick={() => editor && setContainerGap(editor, entry.pos, g.token, $editTier)}>{g.label}</ToolbarGroupItem>
          {/each}
        </ToolbarGroup>
      {:else if selected?.type === 'pageSection'}
        {@const pos = entry.pos}
        <ToolbarGroup type="single" class="bt-group" value={(entry.attrs.width as string) ?? 'normal'} onValueChange={(v) => { if (typeof v === 'string' && v) setSpan(pos, v); }}>
          {#each SPANS as span (span.value)}
            <ToolbarGroupItem size="sm" value={span.value} title={span.label()} aria-label={span.label()} onclick={() => setSpan(pos, span.value)}><Icon name={span.icon} size={14} /></ToolbarGroupItem>
          {/each}
        </ToolbarGroup>
        <ToolbarButton size="sm" title={m.editor_block_tools_section_below()} aria-label={m.editor_block_tools_section_below()} onclick={() => editor && insertSection(editor, pos)}><Icon name="plus" size={14} /></ToolbarButton>
      {:else if selected?.type === 'flexContainer'}
        <ToolbarButton size="sm" title={core.selection.flexGuards?.canRemoveCell ? m.editor_block_tools_remove_cell() : m.editor_block_tools_remove_cell_hint()} aria-label={m.editor_block_tools_remove_cell()} disabled={!core.selection.flexGuards?.canRemoveCell} onclick={() => editor && removeFlexCell(editor, entry.pos)}><Icon name="cell-minus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_add_cell()} aria-label={m.editor_block_tools_add_cell()} onclick={() => editor && addFlexCell(editor, entry.pos)}><Icon name="cell-plus" size={14} /></ToolbarButton>
        <ToolbarGroup type="single" class="bt-group" value={resolvedFlexDirection((entry.attrs.layout as LayoutData), $editTier)} onValueChange={(v) => { if (v) setFlexContainerLayoutField(entry.pos, 'flexDirection', v as string); }}>
          <ToolbarGroupItem size="sm" value="row" title={m.editor_block_tools_direction_row()} aria-label={m.editor_block_tools_direction_row()} onclick={() => setFlexContainerLayoutField(entry.pos, 'flexDirection', 'row')}><Icon name="flex-row" size={14} /></ToolbarGroupItem>
          <ToolbarGroupItem size="sm" value="column" title={m.editor_block_tools_direction_column()} aria-label={m.editor_block_tools_direction_column()} onclick={() => setFlexContainerLayoutField(entry.pos, 'flexDirection', 'column')}><Icon name="flex-column" size={14} /></ToolbarGroupItem>
        </ToolbarGroup>
        <ToolbarGroup type="single" class="bt-group" value={resolvedFlexWrap((entry.attrs.layout as LayoutData), $editTier)} onValueChange={(v) => { if (v) setFlexContainerLayoutField(entry.pos, 'flexWrap', v as string); }}>
          <ToolbarGroupItem size="sm" value="nowrap" title={m.editor_block_tools_no_wrap()} aria-label={m.editor_block_tools_no_wrap()} onclick={() => setFlexContainerLayoutField(entry.pos, 'flexWrap', 'nowrap')}><Icon name="wrap-off" size={14} /></ToolbarGroupItem>
          <ToolbarGroupItem size="sm" value="wrap" title={m.editor_block_tools_wrap()} aria-label={m.editor_block_tools_wrap()} onclick={() => setFlexContainerLayoutField(entry.pos, 'flexWrap', 'wrap')}><Icon name="wrap-on" size={14} /></ToolbarGroupItem>
          <ToolbarGroupItem size="sm" value="scroll" title={m.editor_block_tools_scroll()} aria-label={m.editor_block_tools_scroll()} onclick={() => setFlexContainerLayoutField(entry.pos, 'flexWrap', 'scroll')}><Icon name="wrap-scroll" size={14} /></ToolbarGroupItem>
        </ToolbarGroup>
        <!-- Buttons, not a ToolbarGroup: the current preset is a resolved px
          number, not a stored token, so there's no group value to give it. -->
        {#each Object.entries(GAP_PRESETS) as [key, px] (key)}
          <ToolbarButton size="sm" title={m.editor_block_tools_gap_title_px({ token: key, px })} aria-label={m.editor_block_tools_gap_named({ token: key })} active={resolvedGap((entry.attrs.layout as LayoutData), $editTier, 0) === px} onclick={() => setFlexContainerLayoutField(entry.pos, 'gap', px)}>{key === 'none' ? '0' : key[0].toUpperCase()}</ToolbarButton>
        {/each}
      {:else if selected?.type === 'table'}
        <ToolbarButton size="sm" title={core.selection.tableGuards?.canRemoveCol ? m.editor_block_tools_remove_column() : m.editor_block_tools_remove_column_hint_table()} aria-label={m.editor_block_tools_remove_column()} disabled={!core.selection.tableGuards?.canRemoveCol} onclick={() => editor && removeTableColumn(editor, entry.pos)}><Icon name="column-minus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_add_column()} aria-label={m.editor_block_tools_add_column()} onclick={() => editor && addTableColumn(editor, entry.pos)}><Icon name="column-plus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={core.selection.tableGuards?.canRemoveRow ? m.editor_block_tools_remove_row() : m.editor_block_tools_remove_row_hint_table()} aria-label={m.editor_block_tools_remove_row()} disabled={!core.selection.tableGuards?.canRemoveRow} onclick={() => editor && removeTableRow(editor, entry.pos)}><Icon name="row-minus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_add_row()} aria-label={m.editor_block_tools_add_row()} onclick={() => editor && addTableRow(editor, entry.pos)}><Icon name="row-plus" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_toggle_header()} aria-label={m.editor_block_tools_toggle_header()} active={entry.attrs.showHeader !== false} onclick={() => editor && toggleTableHeader(editor, entry.pos)}><Icon name="table-header" size={14} /></ToolbarButton>
      {/if}
      {#if selected && moves}
        {@const id = selected.id}
        {#each shownMoves(moves) as item (item.move)}
          <ToolbarButton size="sm" title={moveTitle(item, moves[item.move])} aria-label={item.label()} disabled={!moves[item.move]} onclick={() => editor && moveBlockInSections(editor, id, item.move)}><Icon name={item.icon} size={14} /></ToolbarButton>
        {/each}
      {/if}
      {#if selected}
        <ToolbarButton size="sm" title={m.editor_block_tools_move_up_title()} aria-label={m.editor_block_tools_move_up_aria()} onclick={() => selected && moveBlock(selected.id, -1)}><Icon name="chevron-up" size={14} /></ToolbarButton>
        <ToolbarButton size="sm" title={m.editor_block_tools_move_down_title()} aria-label={m.editor_block_tools_move_down_aria()} onclick={() => selected && moveBlock(selected.id, 1)}><Icon name="chevron" size={14} /></ToolbarButton>
        {#if blockIsEditable(selected.type, selected.attrs)}
          <ToolbarButton size="sm" title={m.editor_block_tools_edit()} aria-label={m.editor_block_tools_edit()} onclick={() => selected && blockEdit.start(selected.id)}><Icon name="pencil" size={14} /></ToolbarButton>
        {/if}
        {#if embed}
          <ToolbarButton size="sm" title={'reason' in embed ? embed.reason : m.editor_embed_quick_link()} aria-label={m.editor_embed_quick_link()} disabled={'reason' in embed} onclick={() => selected && embedQuickLink(selected.id)}><Icon name="expand" size={14} /></ToolbarButton>
        {/if}
        <ToolbarButton size="sm" variant="ghost-danger" title={m.editor_block_tools_delete()} aria-label={m.editor_block_tools_delete()} onclick={() => selected && deleteBlock(selected.id)}><Icon name="trash" size={14} /></ToolbarButton>
      {/if}
      </DsToolbar>
    </div>
  {/if}
{/if}

<style>
  /* z-index 10/11: .editor-shell has no stacking context, so these must beat
     the NodeViews' own overlays (z-index up to 5), which come later in the DOM. */
  /* Both boxes cover the measured block exactly, borders painting inward: a
     full-width block's outset would overflow .editor-scroll into a horizontal
     scrollbar (docs/architecture/design-system/tokens.md, "Focus and selection rings"). */
  .block-outline { position: absolute; pointer-events: none; background: color-mix(in srgb, var(--ds-color-accent) 4.5%, transparent); border: 1px solid color-mix(in srgb, var(--ds-color-accent) 18%, transparent); border-radius: var(--ds-radius-md); z-index: 10; }
  /* No background wash, so text stays legible while typing under it. The inset
     hairline keeps 3:1 contrast on a block's dark Surface background, where
     the accent alone falls short. */
  .block-selected {
    position: absolute;
    pointer-events: none;
    border: 1.5px solid var(--ds-color-accent);
    box-shadow: inset 0 0 0 1px var(--ds-color-indicator-companion);
    border-radius: var(--ds-radius-md);
    z-index: 10;
  }
  .block-tools { position: absolute; display: flex; background: var(--ds-color-raised); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); padding: 2px; box-shadow: var(--ds-shadow-sm); z-index: 11; }
  /* These classes are passed as props to the primitives, whose elements are
     in another component's scope, hence :global(). */
  .block-tools :global(.bt-drag) { cursor: grab; }
  .block-tools :global(.bt-drag:active) { cursor: grabbing; }
  :global(.block-tools-row) { gap: 2px; }
  :global(.bt-group) { gap: 1px; }
</style>
