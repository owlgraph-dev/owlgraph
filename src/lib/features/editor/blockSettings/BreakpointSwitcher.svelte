<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One store sets both the tier the sections edit and the canvas
  // preview width, so the two never disagree. Icons, since three words don't
  // fit beside "Values for" in the 270px column.
  import { FieldRow, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { editTier, type Tier } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';

  const items: { value: Tier; icon: string; title: () => string; aria: () => string }[] = [
    { value: 'desktop', icon: 'monitor', title: m.editor_toolbar_tier_desktop_title, aria: m.editor_toolbar_tier_desktop_aria },
    { value: 'tablet', icon: 'tablet', title: m.editor_toolbar_tier_tablet_title, aria: m.editor_toolbar_tier_tablet_aria },
    { value: 'phone', icon: 'phone', title: m.editor_toolbar_tier_phone_title, aria: m.editor_toolbar_tier_phone_aria },
  ];
</script>

<div class="bp-row">
  <FieldRow label={m.editor_block_settings_breakpoint_label()}>
    <SegmentedControl type="single" size="sm" value={$editTier} ariaLabel={m.editor_toolbar_tier_group_aria()}>
      {#each items as it (it.value)}
        <SegmentedControlItem value={it.value} title={it.title()} aria-label={it.aria()} aria-pressed={$editTier === it.value} onclick={() => editTier.set(it.value)}>
          <Icon name={it.icon} size={15} />
        </SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>
</div>

<style>
  .bp-row { padding: 0.15rem 0 0.5rem; border-bottom: 1px solid var(--ds-color-border); margin: 0 0 0.6rem; }
</style>
