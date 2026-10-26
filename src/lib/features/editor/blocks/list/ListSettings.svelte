<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { FieldRow, SegmentedControl, SegmentedControlItem, Select } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor }: BlockSettingsProps = $props();

  const numbering = $derived([
    { value: 'decimal', label: m.editor_block_settings_numbering_decimal() },
    { value: 'lower-alpha', label: m.editor_block_settings_numbering_lower_alpha() },
    { value: 'upper-alpha', label: m.editor_block_settings_numbering_upper_alpha() },
    { value: 'lower-roman', label: m.editor_block_settings_numbering_lower_roman() },
    { value: 'upper-roman', label: m.editor_block_settings_numbering_upper_roman() },
    { value: 'none', label: m.editor_block_settings_numbering_none() },
  ]);
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, ['listStyle', 'spacing'])}>
  {#if target.type === 'orderedList'}
    <FieldRow layout="stack" label={m.editor_block_settings_numbering_label()}>
      <Select
        size="sm"
        width="full"
        items={numbering}
        value={(target.attrs.listStyle as string | undefined) ?? 'decimal'}
        onValueChange={(v) => target.update({ listStyle: v })}
        ariaLabel={m.editor_block_settings_numbering_label()}
      />
    </FieldRow>
  {:else}
    <FieldRow label={m.editor_block_settings_bullet_label()}>
      <SegmentedControl type="single" size="sm" value={(target.attrs.listStyle as string | undefined) ?? 'disc'} ariaLabel={m.editor_block_settings_bullet_label()}>
        <SegmentedControlItem value="disc" onclick={() => target.update({ listStyle: 'disc' })} title={m.editor_block_settings_bullet_disc()}>●</SegmentedControlItem>
        <SegmentedControlItem value="circle" onclick={() => target.update({ listStyle: 'circle' })} title={m.editor_block_settings_bullet_circle()}>○</SegmentedControlItem>
        <SegmentedControlItem value="square" onclick={() => target.update({ listStyle: 'square' })} title={m.editor_block_settings_bullet_square()}>■</SegmentedControlItem>
        <SegmentedControlItem value="none" onclick={() => target.update({ listStyle: 'none' })} title={m.editor_block_settings_bullet_none()}>–</SegmentedControlItem>
      </SegmentedControl>
    </FieldRow>
  {/if}
  <FieldRow layout="stack" label={m.editor_block_settings_spacing_label()}>
    <SegmentedControl type="single" size="sm" stretch value={(target.attrs.spacing as string | undefined) ?? 'normal'} ariaLabel={m.editor_block_settings_spacing_label()}>
      <SegmentedControlItem value="tight" onclick={() => target.update({ spacing: 'tight' })}>{m.editor_block_settings_spacing_tight()}</SegmentedControlItem>
      <SegmentedControlItem value="normal" onclick={() => target.update({ spacing: 'normal' })}>{m.editor_block_settings_spacing_normal()}</SegmentedControlItem>
      <SegmentedControlItem value="loose" onclick={() => target.update({ spacing: 'loose' })}>{m.editor_block_settings_spacing_loose()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
</BlockSettingsSection>
