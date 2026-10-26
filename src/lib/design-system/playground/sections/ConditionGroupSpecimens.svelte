<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import ConditionGroup from '../../ConditionGroup.svelte';
  import Button from '../../Button.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  type Combinator = 'and' | 'or';

  let rootAnd = $state<Combinator>('and');
  let rootOr = $state<Combinator>('or');
  let labelled = $state<Combinator>('and');
  let treeRoot = $state<Combinator>('and');
  let treeChild = $state<Combinator>('or');
  let treeGrandchild = $state<Combinator>('and');
  let hidden = $state<Combinator>('and');
</script>

<SpecimenGrid title="Root group (depth 0, no frame)">
  <Specimen label="combinator=and" state="root-and" wide>
    <ConditionGroup combinator={rootAnd} onCombinatorChange={(c) => (rootAnd = c)} allLabel="All" anyLabel="Any" combinatorAriaLabel="Combinator">
      <div class="cond">class is <code>Article</code></div>
      <div class="cond">published_at is after <code>2026-01-01</code></div>
    </ConditionGroup>
  </Specimen>
  <Specimen label="combinator=or" state="root-or" wide>
    <ConditionGroup combinator={rootOr} onCombinatorChange={(c) => (rootOr = c)} allLabel="All" anyLabel="Any" combinatorAriaLabel="Combinator">
      <div class="cond">tag has <code>news</code></div>
      <div class="cond">tag has <code>release</code></div>
    </ConditionGroup>
  </Specimen>
  <Specimen label="label + actions snippet + footer snippet" state="root-label-actions-footer" wide>
    <ConditionGroup combinator={labelled} onCombinatorChange={(c) => (labelled = c)} allLabel="All" anyLabel="Any" label="Target filter" combinatorAriaLabel="Combinator">
      {#snippet actions()}
        <Button icon size="sm" variant="ghost" title="Clear filter" aria-label="Clear filter"><Icon name="x" /></Button>
      {/snippet}
      {#snippet footer()}
        <Button size="sm"><Icon name="plus" /> Add condition</Button>
        <Button size="sm" variant="ghost"><Icon name="plus" /> Add group</Button>
      {/snippet}
      <div class="cond">class is <code>Article</code></div>
    </ConditionGroup>
  </Specimen>
  <Specimen label="empty group with a label (reads as what it is)" state="root-empty" wide>
    <ConditionGroup combinator="and" onCombinatorChange={() => {}} allLabel="All" anyLabel="Any" label="Target filter" showCombinator={false} combinatorAriaLabel="Combinator">
      {#snippet footer()}
        <Button size="sm"><Icon name="plus" /> Add condition</Button>
      {/snippet}
      <div class="cond cond-muted">No conditions yet.</div>
    </ConditionGroup>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Nesting by depth">
  <Specimen label="depth 0 › 1 › 2 via children" state="nested" wide>
    <ConditionGroup combinator={treeRoot} onCombinatorChange={(c) => (treeRoot = c)} allLabel="All" anyLabel="Any" combinatorAriaLabel="Combinator (root)">
      {#snippet footer()}
        <Button size="sm"><Icon name="plus" /> Add condition</Button>
        <Button size="sm" variant="ghost"><Icon name="plus" /> Add group</Button>
      {/snippet}
      <div class="cond">class is <code>Article</code></div>
      <ConditionGroup depth={1} combinator={treeChild} onCombinatorChange={(c) => (treeChild = c)} allLabel="All" anyLabel="Any" combinatorAriaLabel="Combinator (depth 1)">
        {#snippet actions()}
          <Button icon size="sm" variant="ghost-danger" title="Remove group" aria-label="Remove group"><Icon name="trash" /></Button>
        {/snippet}
        {#snippet footer()}
          <Button size="sm" variant="ghost"><Icon name="plus" /> Add condition</Button>
        {/snippet}
        <div class="cond">tag has <code>news</code></div>
        <div class="cond">tag has <code>release</code></div>
        <ConditionGroup depth={2} combinator={treeGrandchild} onCombinatorChange={(c) => (treeGrandchild = c)} allLabel="All" anyLabel="Any" combinatorAriaLabel="Combinator (depth 2)">
          {#snippet actions()}
            <Button icon size="sm" variant="ghost-danger" title="Remove group" aria-label="Remove group"><Icon name="trash" /></Button>
          {/snippet}
          <div class="cond">author is <code>Alex Example</code></div>
          <div class="cond">published_at is after <code>2026-01-01</code></div>
        </ConditionGroup>
      </ConditionGroup>
      <div class="cond">visibility is <code>public</code></div>
    </ConditionGroup>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="showCombinator=false (single member; header row stays)" state="no-combinator" wide>
    <ConditionGroup combinator={hidden} onCombinatorChange={(c) => (hidden = c)} allLabel="All" anyLabel="Any" showCombinator={false} combinatorAriaLabel="Combinator">
      {#snippet actions()}
        <Button icon size="sm" variant="ghost" title="Clear filter" aria-label="Clear filter"><Icon name="x" /></Button>
      {/snippet}
      <div class="cond">class is <code>Article</code></div>
    </ConditionGroup>
  </Specimen>
  <Specimen label="showCombinator=false, no label, no actions (header omitted)" state="no-header" wide>
    <ConditionGroup combinator="and" onCombinatorChange={() => {}} allLabel="All" anyLabel="Any" showCombinator={false}>
      <div class="cond">class is <code>Article</code></div>
    </ConditionGroup>
  </Specimen>
  <Specimen label="nested group alone (depth 1)" state="nested-alone">
    <ConditionGroup depth={1} combinator="or" onCombinatorChange={() => {}} allLabel="All" anyLabel="Any" combinatorAriaLabel="Combinator">
      <div class="cond">tag has <code>news</code></div>
    </ConditionGroup>
  </Specimen>
</SpecimenGrid>

<style>
  .cond {
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-fg);
    padding: var(--ds-space-sm) var(--ds-space-sm);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-bg);
  }
  .cond-muted { color: var(--ds-color-muted); border-style: dashed; }
  .cond code { font-family: var(--ds-font-mono); }
</style>
