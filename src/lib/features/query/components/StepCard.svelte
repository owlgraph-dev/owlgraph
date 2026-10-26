<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Below the header line: the edge filter, one property row since
  // WireEdgeCondition.property holds one condition, and the target filter, a
  // condition group nested one level in.
  import { Select, Input, Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { NodeClassOption, RelationshipTypeOption } from '$lib/features/semantic';
  import type { WireEdgeDirection } from '../nodeFilter';
  import { MAX_STEP_REPEAT } from '../traversal';
  import { newGroup, propertyOperatorsFor, type ConditionRow, type PropertyRow, type TraversalStepDraft } from '../conditionRows';
  import { propertyLabel, type PropertyOption, type SourceGroup } from './sourceOptions';
  import ConditionRowEditor from './ConditionRowEditor.svelte';
  import ConditionGroupEditor from './ConditionGroupEditor.svelte';

  let {
    step,
    index,
    onChange,
    onRemove,
    propertyOptions = [],
    namespaceOptions = [],
    userOptions = [],
    classOptions = [],
    relationshipTypes = [],
    tagSuggestions = []
  }: {
    step: TraversalStepDraft;
    index: number;
    onChange: (step: TraversalStepDraft) => void;
    onRemove: () => void;
    propertyOptions?: PropertyOption[];
    namespaceOptions?: { id: string; name: string }[];
    userOptions?: { id: string; name: string; email: string }[];
    classOptions?: NodeClassOption[];
    relationshipTypes?: RelationshipTypeOption[];
    tagSuggestions?: string[];
  } = $props();

  const typeItems = $derived(relationshipTypes.map((t) => ({ value: t.slug, label: t.label })));
  const directionItems = [
    { value: 'OUTGOING', label: m.editor_edge_condition_direction_outgoing() },
    { value: 'INCOMING', label: m.editor_edge_condition_direction_incoming() },
    { value: 'EITHER', label: m.editor_edge_condition_direction_either() }
  ];
  const activeType = $derived(relationshipTypes.find((t) => t.slug === step.edge.type) ?? null);
  const edgeProperties = $derived<PropertyOption[]>(activeType?.properties ?? []);
  const edgeSourceGroups = $derived<SourceGroup[]>([
    { label: m.editor_query_modal_source_group_properties(), items: edgeProperties.map((p) => ({ value: `prop:${p.name}`, label: propertyLabel(p) })) }
  ]);
  const edgeRow = $derived<PropertyRow | null>(
    step.edge.hasProperty
      ? { kind: 'property', id: `${step.id}:edge`, name: step.edge.propName, operator: step.edge.propOperator, value: step.edge.propValue, valuesText: step.edge.propValuesText }
      : null
  );

  function setType(slug: string) {
    if (!slug || slug === step.edge.type) return;
    onChange({ ...step, edge: { ...step.edge, type: slug, hasProperty: false, propName: '', propValue: '', propValuesText: '' } });
  }

  function setRepeat(raw: string) {
    onChange({ ...step, repeat: Math.min(MAX_STEP_REPEAT, Math.max(1, Number(raw) || 1)) });
  }

  function addEdgeFilter() {
    const first = edgeProperties[0];
    const ops = propertyOperatorsFor(first?.datatype || 'text');
    onChange({ ...step, edge: { ...step.edge, hasProperty: true, propName: first?.name ?? '', propOperator: ops[0] ?? 'EQ', propValue: '', propValuesText: '' } });
  }

  function setEdgeFilter(next: ConditionRow) {
    if (next.kind !== 'property') return;
    onChange({ ...step, edge: { ...step.edge, propName: next.name, propOperator: next.operator, propValue: next.value, propValuesText: next.valuesText } });
  }

  function removeEdgeFilter() {
    onChange({ ...step, edge: { ...step.edge, hasProperty: false, propName: '', propValue: '', propValuesText: '' } });
  }
</script>

<li class="step">
  <div class="step-head">
    <span class="step-index" aria-hidden="true">{index + 1}</span>
    <div class="step-type">
      <Select items={typeItems} value={step.edge.type} onValueChange={setType} placeholder={m.editor_edge_condition_type_placeholder()} ariaLabel={m.editor_edge_condition_type_aria()} width="full" />
    </div>
    <Select items={directionItems} value={step.edge.direction} onValueChange={(v) => onChange({ ...step, edge: { ...step.edge, direction: v as WireEdgeDirection } })} ariaLabel={m.editor_edge_condition_direction_aria()} />
    <label class="step-repeat">
      <span class="step-repeat-x" aria-hidden="true">×</span>
      <Input type="number" min="1" max={MAX_STEP_REPEAT} value={String(step.repeat)} oninput={(e: Event) => setRepeat((e.currentTarget as HTMLInputElement).value)} aria-label={m.editor_traversal_modal_step_repeat_label()} title={m.editor_traversal_modal_step_repeat_label()} class="step-repeat-input" />
    </label>
    <Button variant="ghost" size="sm" icon onclick={onRemove} title={m.editor_traversal_modal_remove_step()} aria-label={m.editor_traversal_modal_remove_step()}>
      <Icon name="x" size={14} />
    </Button>
  </div>
  {#if edgeRow}
    <div class="step-filter">
      <ConditionRowEditor
        row={edgeRow}
        onChange={setEdgeFilter}
        onRemove={removeEdgeFilter}
        sourceGroups={edgeSourceGroups}
        propertyOptions={edgeProperties}
        removeLabel={m.editor_edge_condition_remove_property()}
      />
    </div>
  {/if}
  {#if step.targetGroup}
    <div class="step-filter">
      <ConditionGroupEditor
        group={step.targetGroup}
        onChange={(g) => onChange({ ...step, targetGroup: g })}
        onRemove={() => onChange({ ...step, targetGroup: null })}
        depth={1}
        label={m.editor_traversal_modal_add_target_filter()}
        {propertyOptions}
        {namespaceOptions}
        {userOptions}
        {classOptions}
        {relationshipTypes}
        {tagSuggestions}
      />
    </div>
  {/if}
  {#if !edgeRow || !step.targetGroup}
    <div class="step-links">
      {#if !edgeRow}
        <Button variant="ghost" size="sm" disabled={edgeProperties.length === 0} onclick={addEdgeFilter} title={edgeProperties.length === 0 ? m.editor_edge_condition_no_properties() : undefined}>
          <Icon name="plus" size={14} />{m.editor_traversal_modal_add_edge_filter()}
        </Button>
      {/if}
      {#if !step.targetGroup}
        <Button variant="ghost" size="sm" onclick={() => onChange({ ...step, targetGroup: newGroup() })}>
          <Icon name="plus" size={14} />{m.editor_traversal_modal_add_target_filter()}
        </Button>
      {/if}
    </div>
  {/if}
</li>

<style>
  .step {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: var(--ds-space-sm) 0.7rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
    min-width: 0;
  }
  .step-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .step-index {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--ds-radius-pill);
    background: var(--ds-color-border);
    color: var(--ds-color-fg);
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-semibold);
  }
  .step-type { flex: 1 1 auto; min-width: 0; }
  .step-repeat { flex: none; display: inline-flex; align-items: center; gap: 0.2rem; color: var(--ds-color-muted); }
  .step-repeat-x { font-size: var(--ds-text-md); }
  /* The class lands on Input's own element through its `class` prop, hence :global(). */
  .step-repeat :global(.step-repeat-input) { width: 3.6rem; }
  .step-filter { padding-left: 1.9rem; min-width: 0; }
  .step-links { display: flex; flex-wrap: wrap; gap: 0.3rem; padding-left: 1.5rem; }
</style>
