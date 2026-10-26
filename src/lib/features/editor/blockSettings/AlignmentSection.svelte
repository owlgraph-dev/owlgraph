<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A grid cell's flat node attrs, not capability data: no tiers.
  import { FieldRow, SegmentedControl, SegmentedControlItem, Switch } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';
  import type { Target } from './types';

  let { target }: { target: Target } = $props();

  const alignX = $derived((target.attrs.alignX as string | undefined) ?? 'start');
  const alignY = $derived((target.attrs.alignY as string | undefined) ?? 'start');
  const stretch = $derived(!!target.attrs.stretch);
  const modified = $derived(alignX !== 'start' || alignY !== 'start' || stretch);
</script>

<BlockSettingsSection id="alignment" title={m.editor_block_settings_section_alignment()} {modified}>
  <FieldRow label={m.editor_block_settings_align_horizontal()}>
    <SegmentedControl type="single" size="sm" value={alignX} ariaLabel={m.editor_block_settings_align_horizontal()}>
      <SegmentedControlItem value="start" onclick={() => target.update({ alignX: 'start' })} title={m.editor_block_settings_align_left_title()}>{m.editor_block_settings_align_left_short()}</SegmentedControlItem>
      <SegmentedControlItem value="center" onclick={() => target.update({ alignX: 'center' })} title={m.editor_block_settings_align_center_title()}>{m.editor_block_settings_align_center_short()}</SegmentedControlItem>
      <SegmentedControlItem value="end" onclick={() => target.update({ alignX: 'end' })} title={m.editor_block_settings_align_right_title()}>{m.editor_block_settings_align_right_short()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  <FieldRow label={m.editor_block_settings_align_vertical()}>
    <SegmentedControl type="single" size="sm" value={alignY} ariaLabel={m.editor_block_settings_align_vertical()}>
      <SegmentedControlItem value="start" onclick={() => target.update({ alignY: 'start' })} title={m.editor_block_settings_align_top_title()}>{m.editor_block_settings_align_top_short()}</SegmentedControlItem>
      <SegmentedControlItem value="center" onclick={() => target.update({ alignY: 'center' })} title={m.editor_block_settings_align_middle_title()}>{m.editor_block_settings_align_middle_short()}</SegmentedControlItem>
      <SegmentedControlItem value="end" onclick={() => target.update({ alignY: 'end' })} title={m.editor_block_settings_align_bottom_title()}>{m.editor_block_settings_align_bottom_short()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  <FieldRow label={m.editor_block_settings_stretch()} info={m.editor_block_settings_stretch_hint()}>
    <Switch checked={stretch} onCheckedChange={(v) => target.update({ stretch: v })} ariaLabel={m.editor_block_settings_stretch()} />
  </FieldRow>
</BlockSettingsSection>
