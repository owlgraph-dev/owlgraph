<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One row per template parameter, with the warn-but-allow declared-type check.
  import { Select, Input, Badge, Alert, EmptyState } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { parameterLocalName } from '$lib/features/semantic';
  import { TRANSFORM_LABELS, TRANSFORM_PARAM_KEYS, TRANSFORM_PARAM_LABELS, declaredTypeMismatch, type TransformId } from '$lib/features/content';
  import SourcePicker from './SourcePicker.svelte';
  import { mappingSourceGroups, mappingSourceToKey, mappingKeyToSource, withStaleValue, type PropertyOption } from './sourceOptions';
  import { knownSourceCategory, transformOptionIds, withMappingSource, type MappingRow } from './mappingRows';

  let {
    rows,
    onChange,
    propertyOptions = []
  }: {
    rows: MappingRow[];
    onChange: (rows: MappingRow[]) => void;
    propertyOptions?: PropertyOption[];
  } = $props();

  const groups = $derived(mappingSourceGroups(propertyOptions));

  function transformLabel(id: string): string {
    return (TRANSFORM_LABELS as Record<string, () => string>)[id]?.() ?? id;
  }

  function replace(i: number, next: MappingRow) {
    onChange(rows.map((r, j) => (j === i ? next : r)));
  }
</script>

{#if rows.length === 0}
  <EmptyState size="sm">{m.editor_query_modal_mapping_empty()}</EmptyState>
{:else}
  <ul class="map-rows">
    {#each rows as mr, i (mr.key)}
      {@const mismatch = declaredTypeMismatch(mr.declaredType, knownSourceCategory(mr.source, propertyOptions))}
      {@const sourceKey = mappingSourceToKey(mr.source, mr.key)}
      {@const paramKeys = mr.transformId ? (TRANSFORM_PARAM_KEYS[mr.transformId as TransformId] ?? []) : []}
      <li class="map-row" class:map-row--with-params={paramKeys.length > 0 || !!mismatch}>
        <div class="map-key">
          <span class="map-name">{parameterLocalName(mr.key)}</span>
          {#if mr.declaredType}<Badge tone="info" title={m.editor_query_modal_mapping_declared_type()}>{mr.declaredType}</Badge>{/if}
          {#if mr.inHtml}<Badge tone="neutral" title={m.editor_query_modal_mapping_html_origin()}>HTML</Badge>{/if}
        </div>
        <div class="map-cell">
          <SourcePicker
            value={sourceKey}
            onChange={(key) => replace(i, withMappingSource(mr, mappingKeyToSource(key, mr.key), propertyOptions))}
            groups={withStaleValue(groups, sourceKey, m.editor_query_modal_source_group_unknown())}
            placeholder={m.editor_query_modal_mapping_auto()}
            ariaLabel={m.editor_query_modal_mapping_source_aria({ key: mr.key })}
          />
        </div>
        <div class="map-cell">
          <Select
            items={[{ value: 'none', label: m.editor_query_modal_no_transform() }, ...transformOptionIds(mr, propertyOptions).map((id) => ({ value: id, label: transformLabel(id) }))]}
            value={mr.transformId || 'none'}
            onValueChange={(v) => replace(i, { ...mr, transformId: v === 'none' ? '' : v, params: {} })}
            ariaLabel={m.editor_query_modal_transform_aria()}
            width="full"
          />
        </div>
        {#if paramKeys.length > 0 || mismatch}
          <div class="map-line">
            {#each paramKeys as paramKey (paramKey)}
              <Input
                value={mr.params[paramKey] ?? ''}
                placeholder={TRANSFORM_PARAM_LABELS[paramKey]?.() ?? paramKey}
                aria-label={TRANSFORM_PARAM_LABELS[paramKey]?.() ?? paramKey}
                oninput={(e: Event) => replace(i, { ...mr, params: { ...mr.params, [paramKey]: (e.currentTarget as HTMLInputElement).value } })}
                class="map-param"
              />
            {/each}
            {#if mismatch}
              <div class="map-mismatch"><Alert tone="warning">{m.editor_query_modal_mapping_type_mismatch({ declared: mismatch.declared, actual: mismatch.actual })}</Alert></div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .map-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  /* Aligned like the condition rows; params and the mismatch note take a second line. */
  .map-row {
    display: grid;
    grid-template-columns: minmax(7rem, 0.8fr) minmax(9rem, 1.2fr) minmax(8rem, 1fr);
    gap: 0.4rem;
    align-items: center;
    min-width: 0;
  }
  .map-key { display: inline-flex; align-items: center; gap: 0.3rem; min-width: 0; }
  .map-name { font-weight: var(--ds-weight-semibold); color: var(--ds-color-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .map-cell { min-width: 0; }
  .map-line { grid-column: 2 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; min-width: 0; }
  .map-line :global(.map-param) { flex: 1 1 8rem; width: auto; }
  @media (max-width: 560px) {
    .map-row { grid-template-columns: minmax(0, 1fr); }
    .map-line { grid-column: 1 / -1; }
  }
  .map-mismatch { flex-basis: 100%; }
</style>
