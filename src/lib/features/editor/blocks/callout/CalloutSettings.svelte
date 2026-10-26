<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { FieldRow, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor }: BlockSettingsProps = $props();

  const variants: { key: string; label: () => string }[] = [
    { key: 'info', label: m.editor_block_settings_callout_info },
    { key: 'tip', label: m.editor_block_settings_callout_tip },
    { key: 'warn', label: m.editor_block_settings_callout_warn },
    { key: 'error', label: m.editor_block_settings_callout_error },
  ];
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, ['variant'])}>
  <FieldRow layout="stack" label={m.editor_block_settings_callout_variant_label()}>
    <SegmentedControl type="single" size="sm" stretch value={(target.attrs.variant as string | undefined) ?? 'info'} ariaLabel={m.editor_block_settings_callout_variant_label()}>
      {#each variants as v (v.key)}
        <SegmentedControlItem value={v.key} onclick={() => target.update({ variant: v.key })}>{v.label()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>
</BlockSettingsSection>
