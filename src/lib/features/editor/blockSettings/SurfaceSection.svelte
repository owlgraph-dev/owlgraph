<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // With `image` the background is Colour or Image. In Image mode the colour
  // stays as the fallback shown while the image loads and around a contained
  // one; back to Colour drops the image layer at every viewport in one step.
  import SurfaceField from '../capabilities/surface/SurfaceField.svelte';
  import SurfaceImageField from '../capabilities/surface/SurfaceImageField.svelte';
  import { Button, FieldRow, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import { editTier, hasAnyOwnValue, hasOwnValueAt, hasSurfaceImage, IMAGE_FIELDS, NO_SURFACE_DEFAULTS, type ImageField, type SurfaceData, type SurfaceDefaults } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';
  import { positionLabels } from './positionLabels';

  type SurfaceFieldName = 'bg' | 'border' | 'radius' | 'shadow';

  let { value, fields = ['bg', 'border', 'radius', 'shadow'], defaults = NO_SURFACE_DEFAULTS, bgWarning = null, image, onChange, onReset, onOverlayOpenChange }: {
    value: SurfaceData | undefined;
    bgWarning?: string | null;
    fields?: SurfaceFieldName[];
    /** The block's group defaults: what each Auto row resolves to. */
    defaults?: SurfaceDefaults;
    /** The image layer, for a host that carries one. */
    image?: {
      /** Which block the section shows: a pending Image choice belongs to it alone. */
      key: string;
      onPick: () => void;
      uploading: boolean;
      /** Drops the image layer at every viewport. */
      onClear: () => void;
    };
    onChange: (field: SurfaceFieldName | ImageField, value: string | number | null) => void;
    /** Sets every field of the edited tier back to Auto. */
    onReset?: () => void;
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  // Image chosen before an image is: the rows to pick one, for this block only.
  let pending = $state<string | null>(null);
  const imageMode = $derived(!!image && (hasSurfaceImage(value) || pending === image.key));
  const modifiedFields = $derived(image ? [...fields, ...IMAGE_FIELDS] : fields);

  function setMode(mode: string) {
    if (!image) return;
    if (mode === 'image') pending = image.key;
    else {
      pending = null;
      if (hasSurfaceImage(value)) image.onClear();
    }
  }
</script>

<BlockSettingsSection id="surface" title={m.editor_block_settings_section_surface()} modified={hasAnyOwnValue(value, modifiedFields)}>
  {#if image}
    <FieldRow layout="stack" label={m.capability_surface_background()}>
      <SegmentedControl type="single" size="sm" stretch value={imageMode ? 'image' : 'color'} ariaLabel={m.capability_surface_background()}>
        <SegmentedControlItem value="color" onclick={() => setMode('color')}>{m.capability_surface_bg_mode_color()}</SegmentedControlItem>
        <SegmentedControlItem value="image" onclick={() => setMode('image')}>{m.capability_surface_bg_mode_image()}</SegmentedControlItem>
      </SegmentedControl>
    </FieldRow>
    {#if imageMode}
      <SurfaceImageField
        {value}
        onChange={(field, v) => onChange(field, v)}
        onPickImage={image.onPick}
        uploading={image.uploading}
        schemeWarning={bgWarning}
        positionLabels={positionLabels()}
        {onOverlayOpenChange}
      />
    {/if}
  {/if}
  <SurfaceField
    {value}
    {fields}
    {defaults}
    bgWarning={imageMode ? null : bgWarning}
    bgLabel={imageMode ? m.capability_surface_bg_fallback() : undefined}
    onChange={(field, v) => onChange(field, v)}
    {onOverlayOpenChange}
  />
  {#if onReset && hasOwnValueAt(value, $editTier)}
    <div class="reset"><Button size="sm" variant="ghost" onclick={onReset}>{m.editor_block_settings_reset_auto()}</Button></div>
  {/if}
</BlockSettingsSection>

<style>
  .reset { display: flex; justify-content: flex-end; }
</style>
