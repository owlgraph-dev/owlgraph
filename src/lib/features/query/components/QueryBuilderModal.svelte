<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // With no traversal step the root group is the flat filter. Adding a step
  // reveals a start choice and reinterprets the root group as the start filter;
  // removing the last step reverts with nothing lost. `formatOptions` is edited
  // in the block settings panel, not here.
  import { untrack } from 'svelte';
  import { Dialog, Button, Input, Select, SegmentedControl, SegmentedControlItem, AccordionItem, Accordion, Alert, FormField } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { WireOrderDirection } from '../nodeFilter';
  import type { TemplateParam } from '$lib/features/content';
  import { getRelationshipTypeCatalog, type NodeClassOption, type RelationshipTypeOption } from '$lib/features/semantic';
  import {
    filterToGroup,
    groupToFilter,
    validateGroup,
    newGroup,
    stepFromWire,
    stepToWire,
    type ConditionGroupDraft,
    type TraversalStepDraft
  } from '../conditionRows';
  import type { QueryDefinition } from '../queryDefinition';
  import { OPERATOR_LABELS, sortSourceGroups, withStaleValue, type PropertyOption } from './sourceOptions';
  import { seedMappingRows, mappingFromRows, type MappingRow } from './mappingRows';
  import ConditionGroupEditor from './ConditionGroupEditor.svelte';
  import TraversalSteps from './TraversalSteps.svelte';
  import MappingSection from './MappingSection.svelte';
  import SourcePicker from './SourcePicker.svelte';

  let {
    open,
    initialValue,
    params = [],
    propertyOptions = [],
    namespaceOptions = [],
    userOptions = [],
    classOptions = [],
    tagSuggestions = [],
    onSave,
    onCancel
  }: {
    open: boolean;
    initialValue: QueryDefinition | null;
    params?: TemplateParam[];
    propertyOptions?: PropertyOption[];
    namespaceOptions?: { id: string; name: string }[];
    userOptions?: { id: string; name: string; email: string }[];
    classOptions?: NodeClassOption[];
    tagSuggestions?: string[];
    onSave: (result: QueryDefinition) => void;
    onCancel: () => void;
  } = $props();

  let rootGroup = $state<ConditionGroupDraft>(newGroup());
  // Leaves of a kind this builder doesn't know: surfaced, since saving drops them.
  let unsupported = $state(0);
  let startMode = $state<'currentPage' | 'filter'>('currentPage');
  let steps = $state<TraversalStepDraft[]>([]);
  let first = $state(20);
  // 'field:<camelCase>' | 'prop:<name>' | '' (none)
  let sortKey = $state('');
  let orderByDirection = $state<WireOrderDirection>('ASC');
  let mappingRows = $state<MappingRow[]>([]);
  let error = $state('');
  // Set once per open, not derived: a derived value would fight the user's own
  // expanding and collapsing.
  let accordionValue = $state<string[]>([]);
  // Rows render before the catalogue resolves; edge properties fill in when it does.
  let relationshipTypes = $state<RelationshipTypeOption[]>([]);

  const sortGroups = $derived(withStaleValue(sortSourceGroups(propertyOptions), sortKey, m.editor_query_modal_source_group_unknown()));

  $effect(() => {
    if (!open) return;
    untrack(() => {
      const v = initialValue;
      first = v?.first ?? 20;
      // orderBy.kind absent means PROPERTY (nodeFilter.ts's OrderByInput).
      sortKey = v?.orderBy?.name ? (v.orderBy.kind === 'INTRINSIC' ? `field:${v.orderBy.name}` : `prop:${v.orderBy.name}`) : '';
      orderByDirection = v?.orderBy?.direction ?? 'ASC';
      mappingRows = seedMappingRows(params, v?.mapping);
      // Format only matters once the template has parameters to map.
      accordionValue = mappingRows.length > 0 ? ['query', 'limit', 'format'] : ['query', 'limit'];
      unsupported = 0;
      if (v?.traversal) {
        const loaded = v.traversal.steps.map(stepFromWire);
        steps = loaded.length ? loaded.map((l) => l.step) : [];
        for (const l of loaded) unsupported += l.unsupported;
        startMode = v.fromCurrentPage || !v.traversal.start.filter ? 'currentPage' : 'filter';
        const start = filterToGroup(v.traversal.start.filter ?? null);
        rootGroup = start.group;
        unsupported += start.unsupported;
      } else {
        steps = [];
        startMode = 'currentPage';
        const parsed = filterToGroup(v?.filter ?? null);
        rootGroup = parsed.group;
        unsupported += parsed.unsupported;
      }
      error = '';
      getRelationshipTypeCatalog().then((catalog) => (relationshipTypes = catalog));
    });
  });

  // The first step makes an existing flat filter the start filter.
  function setSteps(next: TraversalStepDraft[]) {
    if (steps.length === 0 && next.length > 0) startMode = rootGroup.items.length > 0 ? 'filter' : 'currentPage';
    steps = next;
  }

  function problemMessage(problem: NonNullable<ReturnType<typeof validateGroup>>): string {
    if (problem.code === 'needs-property') return m.editor_query_modal_error_needs_property();
    if (problem.code === 'needs-type') return m.editor_query_modal_error_needs_type();
    if (problem.code === 'tag-needs-value') return m.editor_query_modal_error_tag_needs_value();
    const operator = OPERATOR_LABELS[problem.operator]();
    if (problem.code === 'in-needs-value') return m.editor_query_modal_error_in_needs_value({ name: problem.name, operator });
    return m.editor_query_modal_error_needs_value({ name: problem.name, operator });
  }

  function validate(): string {
    if (steps.length === 0) {
      const problem = validateGroup(rootGroup);
      return problem ? problemMessage(problem) : '';
    }
    if (startMode === 'filter') {
      const problem = validateGroup(rootGroup);
      if (problem) return problemMessage(problem);
      if (!groupToFilter(rootGroup)) return m.editor_traversal_modal_error_needs_start_filter();
    }
    for (const s of steps) {
      if (!s.edge.type) return m.editor_query_modal_error_needs_type();
      const edgeProblem = validateGroup(newGroup('and', [s.edge]));
      if (edgeProblem) return problemMessage(edgeProblem);
      if (s.targetGroup) {
        const problem = validateGroup(s.targetGroup);
        if (problem) return problemMessage(problem);
      }
    }
    return '';
  }

  function save() {
    const validationError = validate();
    if (validationError) {
      error = validationError;
      return;
    }
    const usingTraversal = steps.length > 0;
    const sortName = sortKey.replace(/^(field|prop):/, '');
    onSave({
      filter: usingTraversal ? null : groupToFilter(rootGroup),
      traversal: usingTraversal
        ? {
            start: startMode === 'currentPage' ? { nodeIds: [] } : { filter: groupToFilter(rootGroup) },
            steps: steps.map(stepToWire)
          }
        : null,
      fromCurrentPage: usingTraversal && startMode === 'currentPage',
      first,
      orderBy: sortName ? { kind: sortKey.startsWith('field:') ? 'INTRINSIC' : 'PROPERTY', name: sortName, direction: orderByDirection } : null,
      format: 'template',
      mapping: mappingFromRows(mappingRows)
    });
  }
</script>

<Dialog
  {open}
  onOpenChange={(o) => { if (!o) onCancel(); }}
  size="xl"
  title={m.editor_query_modal_title()}
>
  {#if unsupported > 0}
    <Alert tone="info">{m.editor_query_modal_unsupported_notice({ count: unsupported })}</Alert>
  {/if}

  <Accordion bind:value={accordionValue} class="qb-accordion">
    <AccordionItem value="query" title={m.editor_query_modal_query_section_title()}>
      <div class="qb-section">
        {#if steps.length > 0}
          <div class="qb-labelrow">
            <span class="qb-label">{m.editor_traversal_modal_start_label()}</span>
            <SegmentedControl value={startMode} ariaLabel={m.editor_traversal_modal_start_label()}>
              <SegmentedControlItem value="currentPage" onclick={() => (startMode = 'currentPage')}>{m.editor_traversal_modal_start_current_page()}</SegmentedControlItem>
              <SegmentedControlItem value="filter" onclick={() => (startMode = 'filter')}>{m.editor_traversal_modal_start_filter()}</SegmentedControlItem>
            </SegmentedControl>
          </div>
        {/if}
        {#if steps.length === 0 || startMode === 'filter'}
          <ConditionGroupEditor
            group={rootGroup}
            onChange={(g) => (rootGroup = g)}
            {propertyOptions}
            {namespaceOptions}
            {userOptions}
            {classOptions}
            {relationshipTypes}
            {tagSuggestions}
          />
        {/if}
        <TraversalSteps
          {steps}
          onChange={setSteps}
          {propertyOptions}
          {namespaceOptions}
          {userOptions}
          {classOptions}
          {relationshipTypes}
          {tagSuggestions}
        />
      </div>
    </AccordionItem>

    <AccordionItem value="limit" title={m.editor_query_modal_limit_order_label()}>
      <div class="qb-inline">
        <div class="qb-field qb-field--limit">
          <FormField label={m.editor_query_modal_limit_label()}>
            <Input type="number" min="1" max="50" value={String(first)} oninput={(e: Event) => (first = Math.min(50, Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 1)))} />
          </FormField>
        </div>
        <div class="qb-field qb-field--sort">
          <FormField label={m.editor_query_modal_order_by_label()} optionalLabel={m.form_field_optional()} group>
          <div class="qb-sort">
            <SourcePicker value={sortKey} onChange={(k) => (sortKey = k)} groups={sortGroups} placeholder={m.editor_query_modal_order_by_none_placeholder()} ariaLabel={m.editor_query_modal_order_by_aria()} />
            {#if sortKey}
              <Select
                items={[{ value: 'ASC', label: m.editor_query_modal_ascending() }, { value: 'DESC', label: m.editor_query_modal_descending() }]}
                value={orderByDirection}
                onValueChange={(v) => (orderByDirection = v as WireOrderDirection)}
                ariaLabel={m.editor_query_modal_order_direction_aria()}
              />
              <Button variant="ghost" size="sm" icon onclick={() => (sortKey = '')} title={m.editor_query_modal_order_by_clear()} aria-label={m.editor_query_modal_order_by_clear()}>
                <Icon name="x" size={14} />
              </Button>
            {/if}
          </div>
          </FormField>
        </div>
      </div>
    </AccordionItem>

    <AccordionItem value="format" title={m.editor_query_modal_format_label()}>
      <div class="qb-section">
        <div class="qb-inline">
          <div class="qb-field">
            <FormField label={m.editor_query_modal_format_label()}>
              <Select items={[{ value: 'template', label: m.editor_query_modal_format_template() }]} value="template" />
            </FormField>
          </div>
          <p class="qb-hint qb-hint--grow">{m.editor_query_modal_format_hint()}</p>
        </div>
        <div class="qb-subsection">
          <span class="qb-label">{m.editor_query_modal_mapping_label()}</span>
          <MappingSection rows={mappingRows} onChange={(rows) => (mappingRows = rows)} {propertyOptions} />
        </div>
      </div>
    </AccordionItem>
  </Accordion>

  {#if error}<div class="qb-alert"><Alert tone="danger">{error}</Alert></div>{/if}

  {#snippet footer()}
    <Button variant="secondary" onclick={onCancel}>{m.editor_query_modal_cancel()}</Button>
    <Button variant="primary" onclick={save}>{m.editor_query_modal_save()}</Button>
  {/snippet}
</Dialog>

<style>
  /* The class lands on Accordion's root through its `class` prop, hence :global(). */
  :global(.qb-accordion) { margin-bottom: 0.7rem; }
  .qb-section { display: flex; flex-direction: column; gap: var(--ds-space-md); min-width: 0; }
  .qb-subsection { display: flex; flex-direction: column; gap: var(--ds-space-sm); padding-top: var(--ds-space-sm); border-top: 1px solid var(--ds-color-border); }
  .qb-labelrow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); }
  .qb-label { font-size: var(--ds-text-sm); font-weight: var(--ds-weight-semibold); color: var(--ds-color-muted); }
  .qb-hint { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); line-height: 1.5; }
  .qb-hint--grow { flex: 1 1 16rem; }
  .qb-inline { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--ds-space-md); }
  .qb-field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .qb-field--limit { flex: 0 0 5rem; }
  .qb-field--sort { flex: 1 1 18rem; }
  .qb-sort { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
  .qb-sort > :global(:first-child) { flex: 1 1 auto; min-width: 0; }
  .qb-alert { margin-top: 0.7rem; }
</style>
