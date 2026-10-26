<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Select from '../../Select.svelte';
  import MultiSelect from '../../MultiSelect.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const fruits = [
    { value: 'apple', label: 'Apple' },
    { value: 'pear', label: 'Pear' },
    { value: 'plum', label: 'Plum' },
    { value: 'quince', label: 'Quince' },
  ];
  const sources = [
    { label: 'Fields', items: [{ value: 'title', label: 'Title' }, { value: 'slug', label: 'Slug' }] },
    { label: 'Properties', items: [{ value: 'prop:author', label: 'Author' }, { value: 'prop:published', label: 'Published' }] },
    { label: 'Tags', items: [{ value: 'tag', label: 'Tag' }] },
  ];
  const longItems = [
    { value: 'long', label: 'A label far too long for the trigger it sits in, so the value ellipsizes' },
    { value: 'short', label: 'Short' },
  ];

  let fruit = $state('pear');
  let source = $state('prop:author');
  let none = $state('');
  let long = $state('long');
  let several = $state<string[]>(['apple', 'plum']);
  let empty = $state<string[]>([]);
</script>

<SpecimenGrid title="Select — items">
  <Specimen label="flat items" state="select-default" overlay>
    <Select items={fruits} bind:value={fruit} ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="grouped (groups)" state="select-grouped" overlay>
    <Select groups={sources} bind:value={source} ariaLabel="Source" />
  </Specimen>
  <Specimen label="placeholder (empty value)" state="select-placeholder">
    <Select items={fruits} bind:value={none} placeholder="Choose a fruit" ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="leading (a picture before each label)" state="select-leading" overlay>
    <Select items={fruits} bind:value={fruit} {leading} ariaLabel="Fruit" />
  </Specimen>
</SpecimenGrid>

{#snippet leading(value: string)}
  <svg class="swatch" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r={value === 'plum' ? 5 : 3.5} /></svg>
{/snippet}

<style>
  .swatch { width: 0.75rem; height: 0.75rem; fill: var(--ds-color-accent); }
</style>

<SpecimenGrid title="Select — sizes and width" narrow>
  <Specimen label="size=md (default)" state="select-md">
    <Select items={fruits} bind:value={fruit} ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="size=sm (block settings rows)" state="select-sm">
    <Select size="sm" items={fruits} bind:value={fruit} ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="width=auto (shrink-wraps)" state="select-width-auto">
    <Select items={fruits} bind:value={fruit} ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="width=full (fills the cell)" state="select-width-full">
    <Select width="full" items={fruits} bind:value={fruit} ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="long label ellipsizes (width=full)" state="select-long-label">
    <Select width="full" items={longItems} bind:value={long} ariaLabel="Long label" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Select — states">
  <Specimen label="disabled" state="select-disabled">
    <Select items={fruits} value="pear" disabled ariaLabel="Fruit" />
  </Specimen>
  <Specimen label="an item disabled (shown, not choosable)" state="select-item-disabled" overlay>
    <Select items={[{ value: 'public', label: 'Public', disabled: true }, { value: 'internal', label: 'Internal' }, { value: 'restricted', label: 'Restricted' }]} value="internal" ariaLabel="Visibility" />
  </Specimen>
  <Specimen label="name (posts as a hidden form field)" state="select-name">
    <form onsubmit={(e) => e.preventDefault()}><Select name="fruit" items={fruits} bind:value={fruit} ariaLabel="Fruit" /></form>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="MultiSelect">
  <Specimen label="default (placeholder, nothing chosen)" state="multiselect" overlay>
    <MultiSelect items={fruits} bind:value={empty} placeholder="Any fruit" ariaLabel="Fruits" />
  </Specimen>
  <Specimen label="several selected (joined labels)" state="multiselect-several">
    <MultiSelect items={fruits} bind:value={several} placeholder="Any fruit" ariaLabel="Fruits" />
  </Specimen>
  <Specimen label="width=full" state="multiselect-width-full">
    <MultiSelect width="full" items={fruits} bind:value={several} placeholder="Any fruit" ariaLabel="Fruits" />
  </Specimen>
  <Specimen label="disabled" state="multiselect-disabled">
    <MultiSelect items={fruits} value={['apple']} disabled ariaLabel="Fruits" />
  </Specimen>
</SpecimenGrid>
