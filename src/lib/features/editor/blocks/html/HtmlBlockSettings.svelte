<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Inline colours can't follow the page's scheme, so an author pins the one
  // they were picked for (docs/architecture/theming.md).
  import { FieldRow, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import { pinnedScheme } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor }: BlockSettingsProps = $props();

  const scheme = $derived(pinnedScheme(target.attrs.scheme) ?? '');
  const options = $derived([
    { value: '', label: m.editor_block_settings_html_scheme_page() },
    { value: 'light', label: m.content_scheme_option_light() },
    { value: 'dark', label: m.content_scheme_option_dark() },
  ]);
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, ['scheme'])}>
  <FieldRow layout="stack" label={m.editor_block_settings_html_scheme_label()} info={m.editor_block_settings_html_scheme_info()}>
    <SegmentedControl type="single" size="sm" stretch value={scheme} ariaLabel={m.editor_block_settings_html_scheme_label()}>
      {#each options as option (option.value)}
        <SegmentedControlItem value={option.value} onclick={() => target.update({ scheme: option.value || null })}>{option.label}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>
</BlockSettingsSection>
