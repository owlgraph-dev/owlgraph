<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import ChipInput from '../../ChipInput.svelte';
  import Chip from '../../Chip.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const suggestions = ['design', 'engineering', 'research', 'marketing', 'operations'];

  let empty = $state<string[]>([]);
  let chips = $state<string[]>(['design', 'research']);
  let fromSuggestions = $state<string[]>([]);
  let maxed = $state<string[]>(['design', 'engineering']);
  let loose = $state<string[]>(['news', 'release notes']);
  let smEmpty = $state<string[]>([]);
</script>

<SpecimenGrid title="States" narrow>
  <Specimen label="empty (placeholder, no suggestions)" state="empty">
    <ChipInput value={empty} onValueChange={(v) => (empty = v)} placeholder="Add a tag" ariaLabel="Tags" removeLabel="Remove" />
  </Specimen>
  <Specimen label="with chips (Backspace in the empty entry removes the last)" state="chips">
    <ChipInput value={chips} onValueChange={(v) => (chips = v)} placeholder="Add a tag" ariaLabel="Tags" removeLabel="Remove" />
  </Specimen>
  <Specimen label="with suggestions (focus the entry to open)" state="suggestions" overlay>
    <ChipInput value={fromSuggestions} onValueChange={(v) => (fromSuggestions = v)} {suggestions} placeholder="Add a tag" ariaLabel="Tags" removeLabel="Remove" />
  </Specimen>
  <Specimen label="max=2 reached (entry hidden)" state="max-reached">
    <ChipInput value={maxed} onValueChange={(v) => (maxed = v)} {suggestions} max={2} placeholder="Add a tag" ariaLabel="Tags" removeLabel="Remove" />
  </Specimen>
  <Specimen label="size=sm, empty (the narrow-panel row)" state="sm-empty">
    <ChipInput size="sm" value={smEmpty} onValueChange={(v) => (smEmpty = v)} placeholder="Add a tag" ariaLabel="Tags" removeLabel="Remove" />
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <ChipInput value={['design', 'research']} onValueChange={() => {}} disabled ariaLabel="Tags" removeLabel="Remove" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Chip on its own (a list of removable values outside a ChipInput)">
  <Specimen label="sm with remove, md (a touch sheet), static (no onRemove)" state="chip">
    <div class="chips">
      {#each loose as tag (tag)}
        <Chip label={tag} removeLabel="Remove tag" onRemove={() => (loose = loose.filter((t) => t !== tag))} />
      {/each}
      <Chip size="md" label="handbook" removeLabel="Remove tag" onRemove={() => {}} />
      <Chip label="read-only" />
    </div>
  </Specimen>
</SpecimenGrid>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
</style>
