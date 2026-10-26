<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The file input is the editor's (the image block's hidden one); the
  // caller of `onPickImage` uploads and writes the asset.
  import { Button, ColorPickerField, FieldRow, PositionGrid, SegmentedControl, SegmentedControlItem, Slider, type Position } from '$lib/design-system';
  import { mediaVariantUrl } from '$lib/features/media';
  import * as m from '$lib/paraglide/messages';
  import { editTier } from '$lib/features/content';
  import { themeColorOptions } from '$lib/features/content';
  import { COLOR_SWATCHES } from '$lib/features/content';
  import { IMAGE_DEFAULTS, IMAGE_FITS, type ImageField, type ImageFit, type SurfaceData } from '$lib/features/content';
  import { resolvedImageLayer } from '$lib/features/content';

  let {
    value,
    onChange,
    onPickImage,
    uploading = false,
    schemeWarning = null,
    positionLabels,
    onOverlayOpenChange,
  }: {
    value: SurfaceData | undefined;
    onChange: (field: ImageField, value: string | number | null) => void;
    /** Opens the file picker; the caller uploads and stores the image at the edited viewport. */
    onPickImage?: () => void;
    uploading?: boolean;
    /** What text on the image reads like (contrastGuidance.ts), at the edited viewport. */
    schemeWarning?: string | null;
    /** The focus grid's cell names. */
    positionLabels: Record<Position, string>;
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const bp = $derived($editTier);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());
  const own = $derived(value?.[bp] ?? {});
  const layer = $derived(resolvedImageLayer(value, bp));
  const themeColors = themeColorOptions();

  const FIT_LABEL: Record<ImageFit, () => string> = {
    cover: m.capability_surface_image_fit_cover,
    contain: m.capability_surface_image_fit_contain,
    repeat: m.capability_surface_image_fit_repeat,
  };

  function hintFor(v: string): string {
    return bp === 'desktop' ? m.capability_common_default_inline({ value: v }) : m.capability_common_inherited_inline({ value: v });
  }

  const opacity = $derived(layer?.opacity ?? IMAGE_DEFAULTS.overlayOpacity);
  let dragged = $state<number | null>(null);
</script>

<FieldRow layout="stack" label={m.capability_surface_image()} info={m.capability_surface_image_hint()} hint={own.image ? undefined : layer ? m.capability_surface_image_inherited() : undefined}>
  <div class="image">
    {#if layer}
      <!-- A thumbnail: the image's smallest copy, not the upload (docs/architecture/media.md). -->
      <img class="thumb" class:inherited={!own.image} src={mediaVariantUrl(layer.image, 320)} alt="" />
    {/if}
    <div class="actions">
      <Button variant="secondary" size="sm" class="fill" loading={uploading} onclick={() => onPickImage?.()}>
        {own.image ? m.capability_surface_image_replace() : layer ? m.capability_surface_image_own() : m.capability_surface_image_pick()}
      </Button>
      {#if own.image}
        <Button variant="ghost-danger" size="sm" class="fill" onclick={() => onChange('image', null)}>{m.capability_surface_image_remove()}</Button>
      {/if}
    </div>
  </div>
</FieldRow>

{#if layer}
  <FieldRow layout="stack" label={m.capability_surface_image_fit()} hint={own.imageFit ? undefined : hintFor(FIT_LABEL[layer.fit]())}>
    <SegmentedControl type="single" size="sm" stretch value={own.imageFit ?? ''} ariaLabel={m.capability_surface_image_fit()}>
      <SegmentedControlItem value="" onclick={() => onChange('imageFit', null)}>{autoLabel}</SegmentedControlItem>
      {#each IMAGE_FITS as fit (fit)}
        <SegmentedControlItem value={fit} onclick={() => onChange('imageFit', fit)} title={FIT_LABEL[fit]()}>{FIT_LABEL[fit]()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>

  <FieldRow layout="stack" label={m.capability_surface_image_focus()} hint={own.imageFocus ? undefined : hintFor(positionLabels[layer.focus])}>
    <div class="focus">
      <PositionGrid value={layer.focus} labels={positionLabels} ariaLabel={m.capability_surface_image_focus()} onValueChange={(p) => onChange('imageFocus', p)} />
      {#if own.imageFocus}
        <Button size="sm" variant="ghost" onclick={() => onChange('imageFocus', null)}>{autoLabel}</Button>
      {/if}
    </div>
  </FieldRow>

  <FieldRow label={m.capability_surface_overlay()} info={m.capability_surface_overlay_info()}>
    <ColorPickerField
      swatches={COLOR_SWATCHES}
      value={own.overlay ?? null}
      resolved={layer.overlay}
      onValueChange={(c) => onChange('overlay', c)}
      noneLabel={autoLabel}
      noneTitle={bp === 'desktop' ? m.capability_surface_overlay_none() : m.capability_common_inherit_tier()}
      customTitle={m.capability_common_custom_color()}
      {themeColors}
      themeLabel={m.capability_color_theme()}
      customLabel={m.capability_color_custom()}
      ariaLabel={m.capability_surface_overlay()}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
    />
  </FieldRow>

  {#if layer.overlay}
    <FieldRow layout="stack" label={m.capability_surface_overlay_opacity()} hint={own.overlayOpacity != null ? undefined : hintFor(`${opacity} %`)}>
      <div class="opacity">
        <Slider
          class="ov-slider"
          value={opacity}
          min={0}
          max={100}
          step={5}
          ariaLabel={m.capability_surface_overlay_opacity()}
          onValueChange={(v) => (dragged = v)}
          onValueCommit={(v) => {
            dragged = null;
            onChange('overlayOpacity', v);
          }}
        />
        <span class="pct">{dragged ?? opacity} %</span>
      </div>
    </FieldRow>
  {/if}

  <FieldRow layout="stack" label={m.capability_surface_image_scheme()} info={m.capability_surface_image_scheme_info()} warning={schemeWarning}>
    <SegmentedControl type="single" size="sm" stretch value={own.imageScheme ?? ''} ariaLabel={m.capability_surface_image_scheme()}>
      <SegmentedControlItem value="" onclick={() => onChange('imageScheme', null)}>{autoLabel}</SegmentedControlItem>
      <SegmentedControlItem value="light" onclick={() => onChange('imageScheme', 'light')}>{m.content_scheme_option_light()}</SegmentedControlItem>
      <SegmentedControlItem value="dark" onclick={() => onChange('imageScheme', 'dark')}>{m.content_scheme_option_dark()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
{/if}

<style>
  .image { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .thumb {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
  }
  .thumb.inherited { opacity: var(--ds-opacity-disabled); }
  .actions { display: flex; gap: var(--ds-space-sm); }
  .actions :global(.fill) { flex: 1; }
  .focus { display: flex; align-items: flex-start; gap: var(--ds-space-sm); }
  .opacity { display: flex; align-items: center; gap: var(--ds-space-sm); }
  .opacity :global(.ov-slider) { flex: 1; }
  .pct { flex: none; min-width: 3rem; text-align: right; font-size: var(--ds-text-xs); color: var(--ds-color-muted); font-variant-numeric: tabular-nums; }
</style>
