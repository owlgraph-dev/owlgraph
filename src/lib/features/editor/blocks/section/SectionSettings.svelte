<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A section's columns are the page's, set in the page's Layout; the hint
  // takes the author there.
  import { Button, FieldRow, SegmentedControl, SegmentedControlItem, Switch } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';
  import MinHeightField from '../../capabilities/height/MinHeightField.svelte';
  import { hasAnyOwnValue, type HeightData } from '$lib/features/content';

  let { target, editor, actions }: BlockSettingsProps = $props();

  // A bag that sets nothing is stored as nothing.
  const height = $derived({
    value: target.attrs.height as HeightData | null | undefined,
    onChange: (next: HeightData) => target.update({ height: Object.keys(next).length > 0 ? next : null }),
  });

  const width = $derived((target.attrs.width as string | null | undefined) ?? 'normal');
  const single = $derived(target.attrs.columns === 'single');
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, ['width', 'columns', 'bleedToTop']) || hasAnyOwnValue(height.value ?? null)}>
  <FieldRow layout="stack" label={m.section_width_label()}>
    <SegmentedControl type="single" size="sm" stretch value={width} ariaLabel={m.section_width_label()}>
      <SegmentedControlItem value="normal" onclick={() => target.update({ width: null })} title={m.section_width_normal_title()}>{m.section_width_normal()}</SegmentedControlItem>
      <SegmentedControlItem value="wide" onclick={() => target.update({ width: 'wide' })} title={m.section_width_wide_title()}>{m.section_width_wide()}</SegmentedControlItem>
      <SegmentedControlItem value="full" onclick={() => target.update({ width: 'full' })} title={m.section_width_full_title()}>{m.section_width_full()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  <FieldRow layout="stack" label={m.editor_section_columns_label()} info={m.editor_section_columns_info()}>
    <SegmentedControl type="single" size="sm" stretch value={single ? 'single' : 'template'} ariaLabel={m.editor_section_columns_label()}>
      <SegmentedControlItem value="template" onclick={() => { if (single) actions.setSectionSingle?.(false); }}>{m.editor_section_columns_template()}</SegmentedControlItem>
      <SegmentedControlItem value="single" onclick={() => { if (!single) actions.setSectionSingle?.(true); }}>{m.editor_section_columns_single()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  <FieldRow label={m.editor_block_settings_bleed_top()} info={m.editor_block_settings_bleed_top_hint()}>
    <Switch checked={!!target.attrs.bleedToTop} onCheckedChange={(v) => target.update({ bleedToTop: v })} ariaLabel={m.editor_block_settings_bleed_top()} />
  </FieldRow>
  <MinHeightField value={height.value} onChange={height.onChange} />
  <p class="hint">
    {m.editor_section_columns_hint()}
    <Button size="sm" variant="link" onclick={() => actions.selectPage?.()}>{m.editor_section_open_page_layout()}</Button>
  </p>
</BlockSettingsSection>

<style>
  .hint { margin: 0; font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
</style>
