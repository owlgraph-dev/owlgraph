<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Box mode and object fit are selects: their word labels never fit a
  // segmented row.
  import { FieldRow, SegmentedControl, SegmentedControlItem, Select, Input, NumberField, Button, PositionGrid } from '$lib/design-system';
  import { editTier, WIDTH_ATTR, effectiveWidth, effectiveFit, effectivePosition, pinnedScheme } from '$lib/features/content';
  import { positionLabels } from '../../blockSettings/positionLabels';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor, actions }: BlockSettingsProps = $props();

  const uid = $props.id();
  const attrs = $derived(target.attrs);

  const vpKey = $derived(WIDTH_ATTR[$editTier]);
  const vpExplicit = $derived((attrs[vpKey] as number | null | undefined) ?? null);
  const vpEffective = $derived(effectiveWidth(attrs, $editTier));
  const vpInherited = $derived(vpExplicit == null ? vpEffective : null);
  const vpAutoLabel = $derived($editTier === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());

  const boxMode = $derived((attrs.boxMode as string | null | undefined) ?? 'auto');
  const boxItems = $derived([
    { value: 'auto', label: m.editor_block_settings_image_box_auto() },
    { value: 'height', label: m.editor_block_settings_image_box_height() },
    { value: 'aspect', label: m.editor_block_settings_image_box_aspect() },
    { value: 'fill', label: m.editor_block_settings_image_box_fill() },
  ]);
  const fitItems = $derived([
    { value: 'cover', label: m.editor_block_settings_image_fit_cover() },
    { value: 'contain', label: m.editor_block_settings_image_fit_contain() },
    { value: 'fill', label: m.editor_block_settings_image_fit_fill() },
    { value: 'none', label: m.editor_block_settings_image_fit_none() },
    { value: 'scale-down', label: m.editor_block_settings_image_fit_scale_down() },
  ]);
  const boxAspectPresets = ['1/1', '4/3', '3/2', '16/9', '21/9'];

  const backdrop = $derived(pinnedScheme(attrs.backdrop) ?? '');
  const backdropItems = $derived([
    { value: '', label: m.editor_block_settings_image_backdrop_none() },
    { value: 'light', label: m.content_scheme_option_light() },
    { value: 'dark', label: m.content_scheme_option_dark() },
  ]);

  const MODIFIED_KEYS = ['alt', 'boxMode', 'boxHeight', 'boxAspect', 'objectFit', 'objectPosition', 'width', 'widthTablet', 'widthPhone', 'backdrop'];
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, attrs, MODIFIED_KEYS)}>
  <FieldRow layout="stack" label={m.editor_block_settings_image_alt_label()} for="{uid}-alt">
    <Input
      id="{uid}-alt"
      size="sm"
      value={(attrs.alt as string | undefined) ?? ''}
      placeholder={m.editor_block_settings_image_alt_placeholder()}
      onchange={(e: Event) => target.update({ alt: (e.currentTarget as HTMLInputElement).value })}
    />
  </FieldRow>

  <FieldRow layout="stack" label={m.editor_block_settings_image_box_label()} info={boxMode === 'fill' ? m.editor_block_settings_image_box_fill_hint() : undefined}>
    <Select
      size="sm"
      width="full"
      items={boxItems}
      value={boxMode}
      onValueChange={(v) => target.update({ boxMode: v === 'auto' ? null : v })}
      ariaLabel={m.editor_block_settings_image_box_label()}
    />
  </FieldRow>

  {#if boxMode === 'height'}
    <FieldRow label={m.editor_block_settings_image_box_height_label()}>
      <NumberField size="sm"
        value={(attrs.boxHeight as number | null | undefined) ?? null}
        min={20}
        max={2000}
        unit="px"
        placeholder="300"
        ariaLabel={m.editor_block_settings_image_box_height_label()}
        onValueChange={(v) => target.update({ boxHeight: v })}
      />
    </FieldRow>
  {:else if boxMode === 'aspect'}
    <FieldRow layout="stack" label={m.editor_block_settings_image_box_aspect_label()}>
      <SegmentedControl type="single" size="sm" stretch value={(attrs.boxAspect as string | undefined) ?? ''} ariaLabel={m.editor_block_settings_image_box_aspect_label()}>
        {#each boxAspectPresets as r (r)}
          <SegmentedControlItem value={r} onclick={() => target.update({ boxAspect: r })}>{r}</SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FieldRow>
    <FieldRow label={m.editor_block_settings_image_box_aspect_custom_label()} for="{uid}-aspect">
      <span class="short">
        <Input
          id="{uid}-aspect"
          size="sm"
          value={(attrs.boxAspect as string | undefined) ?? ''}
          placeholder="16/9"
          onchange={(e: Event) => target.update({ boxAspect: (e.currentTarget as HTMLInputElement).value.trim() || null })}
        />
      </span>
    </FieldRow>
  {/if}

  {#if boxMode !== 'auto'}
    <FieldRow layout="stack" label={m.editor_block_settings_image_fit_label()}>
      <Select
        size="sm"
        width="full"
        items={fitItems}
        value={effectiveFit(attrs) ?? 'cover'}
        onValueChange={(v) => target.update({ objectFit: v })}
        ariaLabel={m.editor_block_settings_image_fit_label()}
      />
    </FieldRow>
    <FieldRow layout="stack" label={m.editor_block_settings_image_position_label()}>
      <PositionGrid value={effectivePosition(attrs) ?? 'center'} labels={positionLabels()} ariaLabel={m.editor_block_settings_image_position_label()} onValueChange={(p) => target.update({ objectPosition: p })} />
    </FieldRow>
  {/if}

  {#if boxMode !== 'fill'}
    <FieldRow layout="stack" label={m.editor_block_settings_image_width_label()}>
      <SegmentedControl type="single" size="sm" stretch value={vpExplicit == null ? '' : String(vpExplicit)} ariaLabel={m.editor_block_settings_image_width_label()}>
        <SegmentedControlItem value="" onclick={() => target.update({ [vpKey]: null })} title={$editTier === 'desktop' ? m.editor_block_settings_image_width_auto_title_desktop() : m.capability_common_inherit_tier()}>{vpAutoLabel}</SegmentedControlItem>
        {#each [25, 50, 75, 100] as w (w)}
          <SegmentedControlItem value={String(w)} onclick={() => target.update({ [vpKey]: w })} title={m.editor_block_settings_image_width_pct_title({ w })}>{w}%</SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FieldRow>
    <FieldRow label={m.editor_block_settings_image_custom_pct_label()}>
      <NumberField size="sm"
        value={vpExplicit}
        min={1}
        max={100}
        unit="%"
        placeholder={vpInherited != null ? String(vpInherited) : ''}
        ariaLabel={m.editor_block_settings_image_custom_pct_label()}
        onValueChange={(v) => target.update({ [vpKey]: v })}
      />
    </FieldRow>
  {/if}

  <FieldRow layout="stack" label={m.editor_block_settings_image_backdrop_label()} info={m.editor_block_settings_image_backdrop_info()}>
    <SegmentedControl type="single" size="sm" stretch value={backdrop} ariaLabel={m.editor_block_settings_image_backdrop_label()}>
      {#each backdropItems as item (item.value)}
        <SegmentedControlItem value={item.value} onclick={() => target.update({ backdrop: item.value || null })}>{item.label}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>

  <FieldRow layout="stack" label={m.editor_block_settings_image_file_label()} info={m.editor_block_settings_image_hint()}>
    <div class="actions">
      <Button variant="secondary" size="sm" class="fill" onclick={() => actions.replaceImage?.()}>{m.editor_block_settings_image_replace()}</Button>
      <Button variant="danger" size="sm" class="fill" onclick={() => actions.removeBlock?.()}>{m.editor_block_settings_image_remove()}</Button>
    </div>
  </FieldRow>
</BlockSettingsSection>

<style>
  .short { display: inline-block; width: 5.5rem; }
  .actions { display: flex; gap: 0.4rem; }
  .actions :global(.fill) { flex: 1; }
</style>
