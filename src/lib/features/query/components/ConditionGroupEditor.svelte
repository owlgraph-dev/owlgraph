<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A nested group is this component again. The builder creates only the root
  // group; nested ones come from a stored filter (written through GraphQL or
  // MCP) and edit like the root.
  import ConditionGroupEditor from './ConditionGroupEditor.svelte';
  import ConditionRowEditor from './ConditionRowEditor.svelte';
  import { ConditionGroup, Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { NodeClassOption, RelationshipTypeOption } from '$lib/features/semantic';
  import { appendGroupItem, removeGroupItem, updateGroupItem, rowForSourceKey, newGroup, type ConditionGroupDraft, type ConditionItem } from '../conditionRows';
  import { conditionSourceGroups, propertyDatatype, ALL_SOURCE_KINDS, type SourceKind, type PropertyOption } from './sourceOptions';

  // Off: the builder doesn't offer creating a nested group.
  const NESTING_ENABLED = false;

  let {
    group,
    onChange,
    onRemove,
    depth = 0,
    label,
    kinds = ALL_SOURCE_KINDS,
    propertyOptions = [],
    namespaceOptions = [],
    userOptions = [],
    classOptions = [],
    relationshipTypes = [],
    tagSuggestions = []
  }: {
    group: ConditionGroupDraft;
    onChange: (group: ConditionGroupDraft) => void;
    /** For a nested group or an optional filter: a remove action in the header. */
    onRemove?: () => void;
    depth?: number;
    /** Names the group in its header (a step's target filter). */
    label?: string;
    kinds?: readonly SourceKind[];
    propertyOptions?: PropertyOption[];
    namespaceOptions?: { id: string; name: string }[];
    userOptions?: { id: string; name: string; email: string }[];
    classOptions?: NodeClassOption[];
    relationshipTypes?: RelationshipTypeOption[];
    tagSuggestions?: string[];
  } = $props();

  const sourceGroups = $derived(conditionSourceGroups(kinds, { propertyOptions, relationshipTypes }));
  const datatypeOf = (name: string): string => propertyDatatype(propertyOptions, name);

  // Starts on the first property, else on the first offered source.
  function addRow() {
    const first = propertyOptions[0] ? `prop:${propertyOptions[0].name}` : (sourceGroups.find((g) => g.items.length > 0)?.items[0]?.value ?? 'field:TITLE');
    const row = rowForSourceKey(first, datatypeOf);
    if (row) onChange(appendGroupItem(group, row));
  }

  function addGroup() {
    onChange(appendGroupItem(group, newGroup()));
  }

  function replace(id: string, next: ConditionItem) {
    onChange(updateGroupItem(group, id, next));
  }

  function remove(id: string) {
    onChange(removeGroupItem(group, id));
  }
</script>

<ConditionGroup
  combinator={group.combinator}
  onCombinatorChange={(c) => onChange({ ...group, combinator: c })}
  allLabel={m.editor_query_modal_match_all()}
  anyLabel={m.editor_query_modal_match_any()}
  combinatorAriaLabel={m.editor_query_modal_combinator_aria()}
  showCombinator={group.items.length > 1}
  {depth}
  {label}
>
  {#snippet actions()}
    {#if onRemove}
      <Button variant="ghost" size="sm" icon onclick={onRemove} title={m.editor_query_modal_remove_group()} aria-label={m.editor_query_modal_remove_group()}>
        <Icon name="x" size={14} />
      </Button>
    {/if}
  {/snippet}
  {#each group.items as item (item.id)}
    {#if item.kind === 'group'}
      <ConditionGroupEditor
        group={item}
        onChange={(next) => replace(item.id, next)}
        onRemove={() => remove(item.id)}
        depth={depth + 1}
        {kinds}
        {propertyOptions}
        {namespaceOptions}
        {userOptions}
        {classOptions}
        {relationshipTypes}
        {tagSuggestions}
      />
    {:else}
      <ConditionRowEditor
        row={item}
        onChange={(next) => replace(item.id, next)}
        onRemove={() => remove(item.id)}
        {sourceGroups}
        {propertyOptions}
        {namespaceOptions}
        {userOptions}
        {classOptions}
        {relationshipTypes}
        {tagSuggestions}
      />
    {/if}
  {/each}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={addRow}><Icon name="plus" size={14} />{m.editor_query_modal_add_condition()}</Button>
    {#if NESTING_ENABLED}
      <Button variant="ghost" size="sm" onclick={addGroup}><Icon name="plus" size={14} />{m.editor_query_modal_add_group()}</Button>
    {/if}
  {/snippet}
</ConditionGroup>
