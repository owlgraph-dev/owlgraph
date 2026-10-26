<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The graph view's settings (docs/architecture/graph-view.md). Pure controls: GraphView
  // owns the state. One body, two presentations: the floating panel, and the
  // phone's bottom sheet, where every section folds so the sheet stays short.
  import { SegmentedControl, SegmentedControlItem, MultiSelect, Select, Switch, Button, Accordion, AccordionItem, Slider } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { typeItems, classItems, namespaceItems, type NamespaceOption, type PickerItem } from '$lib/features/query';
  import type { NodeClassOption } from '$lib/features/semantic';
  import { LABEL_MODES, NODE_SIZES, type ColorBy, type GraphSettings, type LabelMode, type NodeSize } from '../settings';
  import { EMPTY_FILTER, isFilterEmpty, type GraphFilter } from '../graphFilter';
  import { VIEW_MODE_IDS, type ViewModeId } from '../layout/viewModes';
  import { DEFAULT_FORCES, FORCE_RANGES, type ForceParams } from '../layout/forceParams';
  import { loadOpenSections, saveOpenSections } from '../panelSections';
  import { untrack } from 'svelte';
  import type { NodeType } from '$lib/features/nodes';

  let {
    settings,
    onSettings,
    filter,
    onFilter,
    classOptions = [],
    namespaces = [],
    relationshipTypes = [],
    presentation = 'panel',
  }: {
    settings: GraphSettings;
    onSettings: (patch: Partial<GraphSettings>) => void;
    filter: GraphFilter;
    onFilter: (next: GraphFilter) => void;
    classOptions?: NodeClassOption[];
    namespaces?: NamespaceOption[];
    // The relationship types on the loaded edges.
    relationshipTypes?: PickerItem[];
    /** The floating panel (default) or the phone's bottom sheet. */
    presentation?: 'panel' | 'sheet';
  } = $props();

  const modeLabel: Record<ViewModeId, () => string> = {
    standard: m.graph_panel_mode_standard,
    cluster: m.graph_panel_mode_cluster,
  };
  const labelModeLabel: Record<LabelMode, () => string> = {
    zoom: m.graph_panel_labels_zoom,
    always: m.graph_panel_labels_always,
    never: m.graph_panel_labels_never,
  };
  const nodeSizeLabel: Record<NodeSize, () => string> = {
    degree: m.graph_panel_node_size_degree,
    uniform: m.graph_panel_node_size_uniform,
  };
  const forceRows: { key: keyof ForceParams; label: () => string }[] = [
    { key: 'center', label: m.graph_panel_force_center },
    { key: 'repel', label: m.graph_panel_force_repel },
    { key: 'link', label: m.graph_panel_force_link },
    { key: 'linkDistance', label: m.graph_panel_force_link_distance },
  ];
  const forcesAtDefault = $derived(forceRows.every((r) => settings.forces[r.key] === DEFAULT_FORCES[r.key]));
  // Forces collapsed: the defaults are meant to look right untouched.
  let openSections = $state<string[]>([]);
  // The sheet mounts this body as it opens, so this reads what the reader left open this session.
  let openSheetSections = $state<string[]>(untrack(() => (presentation === 'sheet' ? loadOpenSections() : [])));
  function setForce(key: keyof ForceParams, v: number) {
    onSettings({ forces: { ...settings.forces, [key]: v } });
  }
  const colorByItems: { value: ColorBy; label: string }[] = [
    { value: 'type', label: m.graph_panel_filter_type() },
    { value: 'class', label: m.graph_panel_filter_class() },
    { value: 'namespace', label: m.graph_panel_filter_namespace() },
  ];

  const typeOptions = typeItems();
  const classPickerItems = $derived(classItems(classOptions));
  const namespacePickerItems = $derived(namespaceItems(namespaces));
  const filterActive = $derived(!isFilterEmpty(filter));
</script>

{#snippet viewBody()}
  <SegmentedControl type="single" value={settings.mode} ariaLabel={m.graph_panel_mode_aria()} class="gp-segmented">
    {#each VIEW_MODE_IDS as id (id)}
      <SegmentedControlItem value={id} onclick={() => onSettings({ mode: id })}>{modeLabel[id]()}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
{/snippet}

{#snippet filterReset()}
  {#if filterActive}
    <Button type="button" variant="ghost" size="sm" onclick={() => onFilter(EMPTY_FILTER)}>{m.graph_panel_filter_reset()}</Button>
  {/if}
{/snippet}

{#snippet filterBody()}
  <label class="gp-field">
    <span class="gp-label">{m.graph_panel_filter_type()}</span>
    <MultiSelect items={typeOptions} value={[...filter.types]} onValueChange={(v) => onFilter({ ...filter, types: new Set(v as NodeType[]) })} placeholder={m.graph_panel_filter_type_placeholder()} ariaLabel={m.graph_panel_filter_type()} width="full" />
  </label>
  <label class="gp-field">
    <span class="gp-label">{m.graph_panel_filter_class()}</span>
    <MultiSelect items={classPickerItems} value={[...filter.classIds]} onValueChange={(v) => onFilter({ ...filter, classIds: new Set(v) })} placeholder={m.graph_panel_filter_class_placeholder()} ariaLabel={m.graph_panel_filter_class()} width="full" disabled={classPickerItems.length === 0} />
  </label>
  <label class="gp-field">
    <span class="gp-label">{m.graph_panel_filter_namespace()}</span>
    <MultiSelect items={namespacePickerItems} value={[...filter.namespaceIds]} onValueChange={(v) => onFilter({ ...filter, namespaceIds: new Set(v) })} placeholder={m.graph_panel_filter_namespace_placeholder()} ariaLabel={m.graph_panel_filter_namespace()} width="full" disabled={namespacePickerItems.length === 0} />
  </label>
  <label class="gp-field">
    <span class="gp-label">{m.graph_panel_filter_relationship()}</span>
    <MultiSelect items={relationshipTypes} value={[...filter.relationshipTypes]} onValueChange={(v) => onFilter({ ...filter, relationshipTypes: new Set(v) })} placeholder={m.graph_panel_filter_relationship_placeholder()} ariaLabel={m.graph_panel_filter_relationship()} width="full" disabled={relationshipTypes.length === 0} />
  </label>
  <Switch checked={filter.hideUnconnected} onCheckedChange={(c) => onFilter({ ...filter, hideUnconnected: c })}>{m.graph_panel_filter_hide_unconnected()}</Switch>
{/snippet}

{#snippet displayBody()}
  <div class="gp-field">
    <span class="gp-label">{m.graph_panel_labels()}</span>
    <SegmentedControl type="single" value={settings.labels} ariaLabel={m.graph_panel_labels()} class="gp-segmented">
      {#each LABEL_MODES as mode (mode)}
        <SegmentedControlItem value={mode} onclick={() => onSettings({ labels: mode })}>{labelModeLabel[mode]()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </div>
  <Switch checked={settings.edgeLabels} onCheckedChange={(c) => onSettings({ edgeLabels: c })}>{m.graph_panel_edge_labels()}</Switch>
  <label class="gp-field">
    <span class="gp-label">{m.graph_panel_color_by()}</span>
    <Select items={colorByItems} value={settings.colorBy} onValueChange={(v) => { if (v) onSettings({ colorBy: v as ColorBy }); }} ariaLabel={m.graph_panel_color_by()} width="full" />
  </label>
  <div class="gp-field">
    <span class="gp-label">{m.graph_panel_node_size()}</span>
    <SegmentedControl type="single" value={settings.nodeSize} ariaLabel={m.graph_panel_node_size()} class="gp-segmented">
      {#each NODE_SIZES as size (size)}
        <SegmentedControlItem value={size} onclick={() => onSettings({ nodeSize: size })}>{nodeSizeLabel[size]()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </div>
{/snippet}

{#snippet forcesBody()}
  <div class="gp-forces-body">
    {#each forceRows as row (row.key)}
      <div class="gp-force">
        <span class="gp-label">{row.label()}</span>
        <Slider
          value={settings.forces[row.key]}
          onValueChange={(v) => setForce(row.key, v)}
          min={FORCE_RANGES[row.key].min}
          max={FORCE_RANGES[row.key].max}
          step={FORCE_RANGES[row.key].step}
          ariaLabel={row.label()}
        />
      </div>
    {/each}
    <Button type="button" variant="ghost" size="sm" disabled={forcesAtDefault} onclick={() => onSettings({ forces: DEFAULT_FORCES })}>{m.graph_panel_forces_reset()}</Button>
  </div>
{/snippet}

{#if presentation === 'sheet'}
  <div class="gp gp--sheet" role="group" aria-label={m.graph_panel_toggle()}>
    <Accordion bind:value={openSheetSections} onValueChange={saveOpenSections}>
      <AccordionItem value="view" title={m.graph_panel_section_view()}>
        <div class="gp-sheet-body">{@render viewBody()}</div>
      </AccordionItem>
      <AccordionItem value="filter" title={m.graph_panel_section_filter()}>
        <div class="gp-sheet-body">
          {#if filterActive}<div class="gp-sheet-reset">{@render filterReset()}</div>{/if}
          {@render filterBody()}
        </div>
      </AccordionItem>
      <AccordionItem value="display" title={m.graph_panel_section_display()}>
        <div class="gp-sheet-body">{@render displayBody()}</div>
      </AccordionItem>
      <AccordionItem value="forces" title={m.graph_panel_section_forces()}>
        {@render forcesBody()}
      </AccordionItem>
    </Accordion>
  </div>
{:else}
  <div class="gp" role="group" aria-label={m.graph_panel_toggle()}>
    <section class="gp-section">
      <h3 class="gp-title">{m.graph_panel_section_view()}</h3>
      {@render viewBody()}
    </section>

    <section class="gp-section">
      <div class="gp-head">
        <h3 class="gp-title">{m.graph_panel_section_filter()}</h3>
        {@render filterReset()}
      </div>
      {@render filterBody()}
    </section>

    <section class="gp-section">
      <h3 class="gp-title">{m.graph_panel_section_display()}</h3>
      {@render displayBody()}
    </section>

    <Accordion bind:value={openSections} class="gp-forces">
      <AccordionItem value="forces" title={m.graph_panel_section_forces()} size="sm">
        {@render forcesBody()}
      </AccordionItem>
    </Accordion>
  </div>
{/if}

<style>
  .gp {
    width: 272px;
    max-width: calc(100vw - 2 * var(--ds-space-sm));
    max-height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-fg);
  }
  .gp-section {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.7rem 0.8rem;
    border-bottom: 1px solid var(--ds-color-border);
  }
  .gp-section:last-child { border-bottom: 0; }
  .gp-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.6rem; }
  .gp-title {
    margin: 0;
    font-size: var(--ds-text-xs);
    font-weight: var(--ds-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ds-color-muted);
  }
  .gp-field { display: flex; flex-direction: column; gap: 0.25rem; }
  .gp-label { font-size: 0.76rem; color: var(--ds-color-muted); }
  .gp :global(.gp-segmented) { display: flex; }
  .gp :global(.gp-segmented > *) { flex: 1; }
  .gp-forces-body { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.2rem; }
  /* In the sheet, the sheet is the surface and its body the one scroll box. */
  .gp.gp--sheet { width: auto; max-width: none; max-height: none; overflow: visible; background: none; border: 0; border-radius: 0; box-shadow: none; }
  .gp-sheet-body { display: flex; flex-direction: column; gap: 0.55rem; }
  .gp-sheet-reset { display: flex; justify-content: flex-end; }
  .gp-force { display: flex; flex-direction: column; gap: 0.15rem; }
</style>
