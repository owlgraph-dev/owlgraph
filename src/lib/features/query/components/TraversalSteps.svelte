<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The repeat hint sits once on the label, not per step. With no steps only the
  // add button shows, so the common flat filter stays light.
  import { Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { NodeClassOption, RelationshipTypeOption } from '$lib/features/semantic';
  import { MAX_STEPS } from '../traversal';
  import { newStepDraft, type TraversalStepDraft } from '../conditionRows';
  import type { PropertyOption } from './sourceOptions';
  import StepCard from './StepCard.svelte';

  let {
    steps,
    onChange,
    propertyOptions = [],
    namespaceOptions = [],
    userOptions = [],
    classOptions = [],
    relationshipTypes = [],
    tagSuggestions = []
  }: {
    steps: TraversalStepDraft[];
    onChange: (steps: TraversalStepDraft[]) => void;
    propertyOptions?: PropertyOption[];
    namespaceOptions?: { id: string; name: string }[];
    userOptions?: { id: string; name: string; email: string }[];
    classOptions?: NodeClassOption[];
    relationshipTypes?: RelationshipTypeOption[];
    tagSuggestions?: string[];
  } = $props();
</script>

<div class="steps">
  {#if steps.length > 0}
    <div class="steps-label">
      <span>{m.editor_traversal_modal_steps_label()}</span>
      <span class="steps-hint">{m.editor_traversal_modal_step_repeat_hint()}</span>
    </div>
    <ol class="steps-list">
      {#each steps as step, i (step.id)}
        <StepCard
          {step}
          index={i}
          onChange={(next) => onChange(steps.map((s) => (s.id === step.id ? next : s)))}
          onRemove={() => onChange(steps.filter((s) => s.id !== step.id))}
          {propertyOptions}
          {namespaceOptions}
          {userOptions}
          {classOptions}
          {relationshipTypes}
          {tagSuggestions}
        />
      {/each}
    </ol>
  {/if}
  <div>
    <Button variant="ghost" size="sm" disabled={steps.length >= MAX_STEPS} onclick={() => onChange([...steps, newStepDraft()])}>
      <Icon name="plus" size={14} />{m.editor_traversal_modal_add_step()}
    </Button>
  </div>
</div>

<style>
  .steps { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .steps-label {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-muted);
  }
  .steps-hint { font-weight: var(--ds-weight-normal); }
  .steps-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
</style>
