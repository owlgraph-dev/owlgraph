<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Block spacing or space above. Auto clears the field. Block spacing's Auto
  // shows the caller's `fallback`; space above resolves through the block-type
  // defaults in app.css, which have no JS copy to drift, so it shows no number.
  import { editTier } from '$lib/features/content';
  import { FieldRow, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { resolvedSpace, type SpaceField, type SpacingData } from '$lib/features/content';

  let {
    value,
    field,
    label,
    presets,
    info,
    fallback = null,
    onChange,
  }: {
    value: SpacingData | undefined;
    field: SpaceField;
    label: string;
    /** What Auto resolves to when no tier sets the field (a rhythm: the inherited one); null = unknown here. */
    fallback?: number | null;
    presets: { value: number; label: string; title: string }[];
    /** What Auto means for this field, shown behind the row's ⓘ. */
    info?: string;
    onChange: (field: SpaceField, value: number | null) => void;
  } = $props();

  const bp = $derived($editTier);
  const own = $derived(value?.[bp]?.[field] ?? null);
  const inherited = $derived(own == null ? resolvedSpace(value, bp, field) : null);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());
  const hint = $derived(
    own != null
      ? undefined
      : inherited != null
        ? m.capability_common_inherited_inline({ value: `${inherited} px` })
        : fallback != null
          ? bp === 'desktop'
            ? m.capability_common_default_inline({ value: `${fallback} px` })
            : m.capability_common_inherited_inline({ value: `${fallback} px` })
          : undefined
  );
</script>

<FieldRow layout="stack" {label} {hint} {info}>
  <SegmentedControl type="single" size="sm" stretch value={own == null ? '' : String(own)} ariaLabel={label}>
    <SegmentedControlItem
      value=""
      onclick={() => onChange(field, null)}
      title={bp === 'desktop' ? info : m.capability_common_inherit_tier()}
    >{autoLabel}</SegmentedControlItem>
    {#each presets as p (p.value)}
      <SegmentedControlItem value={String(p.value)} onclick={() => onChange(field, p.value)} title={p.title}>{p.label}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>
