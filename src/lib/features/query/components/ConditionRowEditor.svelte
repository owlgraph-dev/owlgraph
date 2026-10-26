<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The source picker decides the row's kind; operator and value adapt to it.
  // A relationship's optional edge property is a second line: this component,
  // property-only, since WireEdgeCondition.property holds one condition.
  import ConditionRowEditor from './ConditionRowEditor.svelte';
  import { Select, MultiSelect, Input, Button, ChipInput } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { WirePropertyOperator, WireEdgeDirection, WireClassMatch, WireTagOperator, WireIntrinsicField } from '../nodeFilter';
  import { WIRE_TAG_OPERATORS } from '../nodeFilter';
  import { typeItems as buildTypeItems, classItems as buildClassItems, namespaceItems as buildNamespaceItems, localeItems as buildLocaleItems } from '../filterOptions';
  import type { NodeClassOption, RelationshipTypeOption } from '$lib/features/semantic';
  import {
    needsValue,
    intrinsicNeedsValue,
    tagTakesList,
    intrinsicOperatorsFor,
    propertyOperatorsFor,
    sourceKeyOfRow,
    rowForSourceKey,
    type ConditionRow,
    type EdgeRow,
    type PropertyRow
  } from '../conditionRows';
  import { OPERATOR_LABELS, CLASS_OPERATOR_LABELS, TAG_OPERATOR_LABELS, withStaleValue, propertyLabel, propertyDatatype, type SourceGroup, type PropertyOption } from './sourceOptions';
  import SourcePicker from './SourcePicker.svelte';

  let {
    row,
    onChange,
    onRemove,
    sourceGroups,
    propertyOptions,
    namespaceOptions = [],
    userOptions = [],
    classOptions = [],
    relationshipTypes = [],
    tagSuggestions = [],
    removeLabel
  }: {
    row: ConditionRow;
    onChange: (row: ConditionRow) => void;
    onRemove: () => void;
    sourceGroups: SourceGroup[];
    /** Node properties, or on the edge-property line the relationship type's. */
    propertyOptions: PropertyOption[];
    namespaceOptions?: { id: string; name: string }[];
    userOptions?: { id: string; name: string; email: string }[];
    classOptions?: NodeClassOption[];
    relationshipTypes?: RelationshipTypeOption[];
    tagSuggestions?: string[];
    removeLabel?: string;
  } = $props();

  const datatypeOf = (name: string): string => propertyDatatype(propertyOptions, name);
  const sourceKey = $derived(sourceKeyOfRow(row));
  const groups = $derived(withStaleValue(sourceGroups, sourceKey, m.editor_query_modal_source_group_unknown()));

  function setSource(key: string) {
    if (key === sourceKey) return;
    // Same kind: keep the operator where it still applies.
    if (row.kind === 'property' && key.startsWith('prop:')) {
      const name = key.slice(5);
      const ops = propertyOperatorsFor(datatypeOf(name));
      onChange({ ...row, name, operator: ops.includes(row.operator) ? row.operator : (ops[0] ?? 'EQ') });
      return;
    }
    if (row.kind === 'intrinsic' && key.startsWith('field:')) {
      const field = key.slice(6) as WireIntrinsicField;
      const ops = intrinsicOperatorsFor(field);
      onChange({ kind: 'intrinsic', id: row.id, field, operator: ops.includes(row.operator) ? row.operator : (ops[0] ?? 'EQ'), value: '', valuesText: '' });
      return;
    }
    if (row.kind === 'edge' && key.startsWith('edge:')) {
      onChange({ ...row, type: key.slice(5), hasProperty: false, propName: '', propValue: '', propValuesText: '' });
      return;
    }
    const next = rowForSourceKey(key, datatypeOf, row.id);
    if (next) onChange(next);
  }

  const propertyOps = $derived(row.kind === 'property' ? propertyOperatorsFor(datatypeOf(row.name)) : []);
  const intrinsicOps = $derived(row.kind === 'intrinsic' ? intrinsicOperatorsFor(row.field) : []);

  function operatorItems(): { value: string; label: string }[] {
    if (row.kind === 'property') return propertyOps.map((op) => ({ value: op, label: OPERATOR_LABELS[op]() }));
    if (row.kind === 'intrinsic') {
      const isClass = row.field === 'CLASS_ID';
      return intrinsicOps.map((op) => ({ value: op, label: ((isClass && CLASS_OPERATOR_LABELS[op]) || OPERATOR_LABELS[op])() }));
    }
    if (row.kind === 'tag') return WIRE_TAG_OPERATORS.map((op) => ({ value: op, label: TAG_OPERATOR_LABELS[op]() }));
    return [
      { value: 'OUTGOING', label: m.editor_edge_condition_direction_outgoing() },
      { value: 'INCOMING', label: m.editor_edge_condition_direction_incoming() },
      { value: 'EITHER', label: m.editor_edge_condition_direction_either() }
    ];
  }

  function setOperator(v: string) {
    if (!v) return;
    switch (row.kind) {
      case 'property':
        onChange({ ...row, operator: v as WirePropertyOperator });
        break;
      case 'intrinsic':
        onChange({ ...row, operator: v as WirePropertyOperator });
        break;
      case 'tag': {
        const op = v as WireTagOperator;
        // HAS holds one tag: keep the first chip when narrowing to it.
        onChange({ ...row, operator: op, values: tagTakesList(op) ? row.values : row.values.slice(0, 1) });
        break;
      }
      case 'edge':
        onChange({ ...row, direction: v as WireEdgeDirection });
        break;
    }
  }

  const namespaceItems = $derived(buildNamespaceItems(namespaceOptions));
  const userItems = $derived(userOptions.map((u) => ({ value: u.id, label: u.name || u.email })));
  const classItems = $derived(buildClassItems(classOptions));
  const typeItems = buildTypeItems();
  const localeItems = buildLocaleItems();
  const classValues = $derived(row.kind === 'intrinsic' ? row.valuesText.split(',').map((v) => v.trim()).filter(Boolean) : []);

  const activeType = $derived(row.kind === 'edge' ? (relationshipTypes.find((t) => t.slug === row.type) ?? null) : null);
  const edgeProperties = $derived<PropertyOption[]>(activeType?.properties ?? []);
  const edgeSourceGroups = $derived<SourceGroup[]>([
    { label: m.editor_query_modal_source_group_properties(), items: edgeProperties.map((p) => ({ value: `prop:${p.name}`, label: propertyLabel(p) })) }
  ]);
  const edgeRow = $derived<PropertyRow | null>(
    row.kind === 'edge' && row.hasProperty
      ? { kind: 'property', id: `${row.id}:edge`, name: row.propName, operator: row.propOperator, value: row.propValue, valuesText: row.propValuesText }
      : null
  );

  function addEdgeProperty() {
    if (row.kind !== 'edge') return;
    const first = edgeProperties[0];
    const ops = propertyOperatorsFor(first?.datatype || 'text');
    onChange({ ...row, hasProperty: true, propName: first?.name ?? '', propOperator: ops[0] ?? 'EQ', propValue: '', propValuesText: '' });
  }

  function setEdgeProperty(next: ConditionRow) {
    if (row.kind !== 'edge' || next.kind !== 'property') return;
    onChange({ ...row, propName: next.name, propOperator: next.operator, propValue: next.value, propValuesText: next.valuesText });
  }

  function removeEdgeProperty() {
    if (row.kind !== 'edge') return;
    onChange({ ...row, hasProperty: false, propName: '', propValue: '', propValuesText: '' });
  }

  const edge = $derived(row.kind === 'edge' ? (row as EdgeRow) : null);
</script>

<div class="cond-row" class:cond-row--with-line={!!edgeRow}>
  <div class="cond-cell">
    <SourcePicker value={sourceKey} onChange={setSource} {groups} placeholder={m.editor_query_modal_source_placeholder()} ariaLabel={m.editor_query_modal_source_aria()} />
  </div>
  <div class="cond-cell">
    <Select items={operatorItems()} value={row.kind === 'edge' ? row.direction : row.operator} onValueChange={setOperator} ariaLabel={m.editor_query_modal_operator_aria()} width="full" />
  </div>
  <div class="cond-cell cond-cell--value">
    {#if row.kind === 'property'}
      {#if row.operator === 'IN'}
        <Input value={row.valuesText} placeholder={m.editor_query_modal_values_placeholder()} oninput={(e: Event) => onChange({ ...row, valuesText: (e.currentTarget as HTMLInputElement).value })} aria-label={m.editor_query_modal_value_placeholder()} />
      {:else if needsValue(row.operator)}
        <Input value={row.value} placeholder={m.editor_query_modal_value_placeholder()} oninput={(e: Event) => onChange({ ...row, value: (e.currentTarget as HTMLInputElement).value })} aria-label={m.editor_query_modal_value_placeholder()} />
      {/if}
    {:else if row.kind === 'intrinsic'}
      {#if row.field === 'CLASS_ID'}
        <div class="cond-class">
          {#if row.operator === 'IN'}
            <MultiSelect items={classItems} value={classValues} onValueChange={(v) => onChange({ ...row, valuesText: v.join(', ') })} placeholder={m.editor_intrinsic_condition_class_values_placeholder()} width="full" />
          {:else}
            <Select items={classItems} value={row.value} onValueChange={(v) => onChange({ ...row, value: v })} placeholder={m.editor_intrinsic_condition_class_placeholder()} width="full" />
          {/if}
          <Select
            items={[{ value: 'IS_A', label: m.editor_class_match_subclasses() }, { value: 'EXACT', label: m.editor_class_match_exact() }]}
            value={row.classMatch ?? 'IS_A'}
            onValueChange={(v) => onChange({ ...row, classMatch: v as WireClassMatch })}
            ariaLabel={m.editor_class_match_aria()}
          />
        </div>
      {:else if row.operator === 'IN'}
        <Input value={row.valuesText} placeholder={m.editor_query_modal_values_placeholder()} oninput={(e: Event) => onChange({ ...row, valuesText: (e.currentTarget as HTMLInputElement).value })} aria-label={m.editor_query_modal_value_placeholder()} />
      {:else if !intrinsicNeedsValue(row.operator)}
        <span></span>
      {:else if row.field === 'CREATED_AT' || row.field === 'UPDATED_AT'}
        <Input type="date" value={row.value} oninput={(e: Event) => onChange({ ...row, value: (e.currentTarget as HTMLInputElement).value })} aria-label={m.editor_query_modal_value_placeholder()} />
      {:else if row.field === 'TYPE'}
        <Select items={typeItems} value={row.value} onValueChange={(v) => onChange({ ...row, value: v })} placeholder={m.editor_intrinsic_condition_type_placeholder()} width="full" />
      {:else if row.field === 'LOCALE'}
        <Select items={localeItems} value={row.value} onValueChange={(v) => onChange({ ...row, value: v })} placeholder={m.editor_intrinsic_condition_locale_placeholder()} width="full" />
      {:else if row.field === 'NAMESPACE_ID'}
        <Select items={namespaceItems} value={row.value} onValueChange={(v) => onChange({ ...row, value: v })} placeholder={m.editor_intrinsic_condition_namespace_placeholder()} width="full" />
      {:else if row.field === 'CREATED_BY'}
        <Select items={userItems} value={row.value} onValueChange={(v) => onChange({ ...row, value: v })} placeholder={m.editor_intrinsic_condition_creator_placeholder()} width="full" />
      {:else}
        <Input value={row.value} placeholder={m.editor_query_modal_value_placeholder()} oninput={(e: Event) => onChange({ ...row, value: (e.currentTarget as HTMLInputElement).value })} aria-label={m.editor_query_modal_value_placeholder()} />
      {/if}
    {:else if row.kind === 'tag'}
      <ChipInput
        value={row.values}
        onValueChange={(values) => onChange({ ...row, values })}
        suggestions={tagSuggestions}
        max={tagTakesList(row.operator) ? undefined : 1}
        placeholder={m.editor_tag_condition_placeholder()}
        ariaLabel={m.editor_query_modal_source_group_tags()}
        removeLabel={m.editor_tag_condition_remove()}
      />
    {:else if edge}
      {#if !edge.hasProperty}
        <Button variant="ghost" size="sm" disabled={edgeProperties.length === 0} onclick={addEdgeProperty} title={edgeProperties.length === 0 ? m.editor_edge_condition_no_properties() : undefined}>
          <Icon name="plus" size={14} />{m.editor_edge_condition_add_property()}
        </Button>
      {/if}
    {/if}
  </div>
  <div class="cond-cell cond-cell--remove">
    <Button variant="ghost" size="sm" icon onclick={onRemove} title={removeLabel ?? m.editor_query_modal_remove_condition()} aria-label={removeLabel ?? m.editor_query_modal_remove_condition()}>
      <Icon name="x" size={14} />
    </Button>
  </div>
  {#if edgeRow}
    <div class="cond-line">
      <ConditionRowEditor
        row={edgeRow}
        onChange={setEdgeProperty}
        onRemove={removeEdgeProperty}
        sourceGroups={edgeSourceGroups}
        propertyOptions={edgeProperties}
        removeLabel={m.editor_edge_condition_remove_property()}
      />
    </div>
  {/if}
</div>

<style>
  /* One grid for every kind of row, so the columns line up; min-width:0 cells
     ellipsize a long label instead of widening the row. */
  .cond-row {
    display: grid;
    grid-template-columns: minmax(9rem, 1.1fr) minmax(8rem, 0.9fr) minmax(0, 1.5fr) auto;
    gap: 0.4rem;
    align-items: center;
    min-width: 0;
  }
  .cond-cell { min-width: 0; display: flex; align-items: center; }
  .cond-cell--value { justify-content: flex-start; }
  .cond-cell--remove { justify-content: flex-end; }
  .cond-class { display: flex; gap: 0.4rem; align-items: center; width: 100%; min-width: 0; }
  .cond-class > :global(:first-child) { flex: 1 1 auto; min-width: 0; }
  /* Indented under operator and value, so it reads as a refinement of the row above. */
  .cond-line { grid-column: 2 / -1; min-width: 0; }
  @media (max-width: 560px) {
    .cond-row { grid-template-columns: minmax(0, 1fr) auto; }
    .cond-line { grid-column: 1 / -1; }
  }
</style>
