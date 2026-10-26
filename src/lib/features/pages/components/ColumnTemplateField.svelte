<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One viewport's column template (pageColumns.ts), the one template editor for
  // pages, page layouts and grids. A smaller viewport never has more columns
  // than a larger one (setTierColumnCount).
  import { FieldRow, NumberField } from '$lib/design-system';
  import { MAX_COLUMN_RATIO, MAX_PAGE_COLUMNS, setTierColumnCount, setTierColumnRatio, type ColumnTemplate, type Tier } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';

  let { template, tier, onChange, tierLabel = undefined, maxColumns = MAX_PAGE_COLUMNS, label = undefined, info = undefined }: {
    template: ColumnTemplate;
    tier: Tier;
    onChange: (next: ColumnTemplate) => void;
    /** For the accessible names, where several viewports are shown at once. */
    tierLabel?: string;
    /** For the desktop tier: a page's 4, a grid's its own count. */
    maxColumns?: number;
    /** Where the template is not a page's. */
    label?: string;
    info?: string;
  } = $props();

  const ratios = $derived(template[tier]);
  const cap = $derived(tier === 'desktop' ? maxColumns : template[tier === 'tablet' ? 'desktop' : 'tablet'].length);
  const countLabel = $derived(tierLabel ? m.editor_page_columns_count_tier({ tier: tierLabel }) : m.editor_page_columns_count());
  const ratioLabel = (n: number) => (tierLabel ? m.editor_page_columns_ratio_tier({ n, tier: tierLabel }) : m.editor_page_columns_ratio({ n }));
</script>

<FieldRow label={label ?? m.editor_page_columns_label()} info={info ?? m.editor_page_columns_info()}>
  <NumberField
    size="sm"
    value={ratios.length}
    min={1}
    max={cap}
    ariaLabel={countLabel}
    onValueChange={(v) => { if (v != null) onChange(setTierColumnCount(template, tier, v, maxColumns)); }}
  />
</FieldRow>
{#if ratios.length > 1}
  <FieldRow layout="stack" label={m.editor_page_columns_ratios()} info={m.editor_page_columns_ratios_info()}>
    <div class="columns">
      {#each ratios as ratio, i (i)}
        <NumberField
          size="sm"
          value={ratio}
          min={1}
          max={MAX_COLUMN_RATIO}
          ariaLabel={ratioLabel(i + 1)}
          onValueChange={(v) => { if (v != null) onChange(setTierColumnRatio(template, tier, i, v, maxColumns)); }}
        />
      {/each}
    </div>
  </FieldRow>
{/if}

<style>
  .columns { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); align-items: center; }
</style>
