<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Where a block is and how it sits there (docs/architecture/blocks/layout.md, "Placement"): the
  // moves are commands, one undo step each; the alignment is per-viewport data.
  // Either row can be the only one.
  import { FieldRow, SegmentedControl, SegmentedControlItem, Toolbar, ToolbarButton } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import {
    editTier,
    hasAnyOwnValue,
    placementAligns,
    resolvedAlign,
    setPlacementAlign,
    type PlacementAlign,
    type PlacementData,
    type PlacementKind,
    type SectionMove,
  } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';
  import { moveTitle, shownMoves } from './placementMoves';

  let { moves = null, onMove, align = undefined }: {
    /** The moves the block has where it is; null shows none. */
    moves?: Record<SectionMove, boolean> | null;
    onMove: (move: SectionMove) => void;
    align?: { value: PlacementData | null | undefined; kind: PlacementKind; onChange: (next: PlacementData) => void };
  } = $props();

  const bp = $derived($editTier);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());

  const LABEL: Record<PlacementAlign, () => string> = {
    start: m.editor_placement_align_start,
    center: m.editor_placement_align_center,
    end: m.editor_placement_align_end,
    stretch: m.editor_placement_align_stretch,
  };
  // A card sits where its cell's alignment puts it: no one value to name.
  const AUTO_ALIGN: Record<PlacementKind, PlacementAlign | null> = { box: 'stretch', image: 'center', card: null };
  const INFO: Record<PlacementKind, () => string> = {
    box: m.editor_placement_align_info,
    card: m.editor_placement_align_info_card,
    image: m.editor_placement_align_info_image,
  };

  const own = $derived(align?.value?.[bp]?.align ?? null);
  // Auto is the kind's own look on a desktop, the larger tier's value below.
  const autoValue = $derived.by(() => {
    if (!align) return null;
    if (bp === 'desktop') return AUTO_ALIGN[align.kind];
    return resolvedAlign(align.value, bp === 'tablet' ? 'desktop' : 'tablet', align.kind) ?? AUTO_ALIGN[align.kind];
  });
  const autoTitle = $derived(
    bp === 'desktop'
      ? autoValue ? m.capability_common_default_inline({ value: LABEL[autoValue]() }) : m.capability_common_auto()
      : m.capability_common_inherit_tier()
  );
  const hint = $derived(
    own || !autoValue ? undefined : bp === 'desktop' ? m.capability_common_default_inline({ value: LABEL[autoValue]() }) : m.capability_common_inherited_inline({ value: LABEL[autoValue]() })
  );
</script>

<BlockSettingsSection id="placement" title={m.editor_block_settings_section_placement()} modified={hasAnyOwnValue(align?.value ?? null)}>
  {#if moves}
    {@const has = moves}
    <FieldRow layout="stack" label={m.editor_placement_move_label()} info={m.editor_placement_move_info()}>
      <Toolbar aria-label={m.editor_placement_move_label()}>
        {#each shownMoves(has) as item (item.move)}
          <ToolbarButton size="sm" title={moveTitle(item, has[item.move])} aria-label={item.label()} disabled={!has[item.move]} onclick={() => onMove(item.move)}><Icon name={item.icon} size={14} /></ToolbarButton>
        {/each}
      </Toolbar>
    </FieldRow>
  {/if}
  {#if align}
    {@const ctl = align}
    <FieldRow layout="stack" label={m.editor_placement_align_label()} {hint} info={INFO[ctl.kind]()}>
      <SegmentedControl type="single" size="sm" stretch value={own ?? ''} ariaLabel={m.editor_placement_align_label()}>
        <SegmentedControlItem value="" onclick={() => ctl.onChange(setPlacementAlign(ctl.value, bp, null))} title={autoTitle}>{autoLabel}</SegmentedControlItem>
        {#each placementAligns(ctl.kind) as a (a)}
          <SegmentedControlItem value={a} onclick={() => ctl.onChange(setPlacementAlign(ctl.value, bp, a))} title={LABEL[a]()} aria-label={LABEL[a]()}><Icon name="align-{a}" size={15} /></SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FieldRow>
  {/if}
</BlockSettingsSection>
