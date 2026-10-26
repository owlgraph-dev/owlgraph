<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Background only: the canvas has no corners to round or edge to shadow.
  // Only page-strength theme grounds, never a literal, so the page follows
  // every colour scheme and its text still reads. One value for every viewport.
  import { ColorPickerField, FieldRow } from '$lib/design-system';
  import { colorToken, pageGround, pageGroundOptions, setPageGround, type PageSurface } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';

  let { value, onChange, onOverlayOpenChange }: {
    value: PageSurface | undefined;
    onChange: (next: PageSurface) => void;
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const options = pageGroundOptions();
  const own = $derived(pageGround(value));
</script>

<BlockSettingsSection id="surface" title={m.editor_block_settings_section_surface()} modified={own != null}>
  <FieldRow label={m.capability_surface_background()} info={m.editor_page_background_info()}>
    <ColorPickerField
      swatches={[]}
      custom={false}
      value={own}
      resolved={colorToken('background')}
      onValueChange={(c) => onChange(setPageGround(c))}
      noneLabel={m.capability_common_auto()}
      noneTitle={m.editor_page_background_auto_title()}
      customTitle={m.capability_common_custom_color()}
      themeColors={options}
      themeLabel={m.capability_color_theme()}
      ariaLabel={m.capability_surface_background()}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
    />
  </FieldRow>
</BlockSettingsSection>
