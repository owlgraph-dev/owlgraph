<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Accordion from '../../Accordion.svelte';
  import AccordionItem from '../../AccordionItem.svelte';
  import FormField from '../../FormField.svelte';
  import Input from '../../Input.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let open = $state<string[]>(['source']);
  let openSm = $state<string[]>([]);
  let openAll = $state<string[]>(['a', 'b']);
</script>

<SpecimenGrid title="type=multiple (sections open independently)">
  <Specimen label="size=md, first open by default, one disabled — open: {open.join(', ') || 'none'}" state="md" wide>
    <Accordion bind:value={open}>
      <AccordionItem value="source" title="Source">
        <p class="body">Which nodes the query starts from: a class, a namespace or a tag.</p>
        <p class="body">Every later step filters or traverses from this set.</p>
      </AccordionItem>
      <AccordionItem value="filter" title="Filter">
        <p class="body">Conditions on the current set. All or any of them must match.</p>
        <p class="body">Nested groups combine the two.</p>
      </AccordionItem>
      <AccordionItem value="output" title="Output" disabled>
        <p class="body">Unavailable until a source is chosen.</p>
      </AccordionItem>
    </Accordion>
  </Specimen>
  <Specimen label="size=sm, collapsed by default (secondary section among form fields)" state="sm" wide>
    <div class="form">
      <FormField label="Title"><Input value="Untitled page" readonly /></FormField>
      <Accordion bind:value={openSm}>
        <AccordionItem value="classes" title="Class fields" size="sm">
          <p class="body">Fields declared by the page's classes appear here once assigned.</p>
          <p class="body">They are optional and rarely edited.</p>
        </AccordionItem>
      </Accordion>
    </div>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="all open" state="all-open">
    <Accordion bind:value={openAll}>
      <AccordionItem value="a" title="First">
        <p class="body">Open.</p>
      </AccordionItem>
      <AccordionItem value="b" title="Second">
        <p class="body">Also open.</p>
      </AccordionItem>
    </Accordion>
  </Specimen>
  <Specimen label="all closed" state="all-closed">
    <Accordion value={[]}>
      <AccordionItem value="a" title="First">
        <p class="body">Closed.</p>
      </AccordionItem>
      <AccordionItem value="b" title="Second">
        <p class="body">Closed.</p>
      </AccordionItem>
    </Accordion>
  </Specimen>
  <Specimen label="sm and md mixed in one group" state="mixed-sizes">
    <Accordion value={['md']}>
      <AccordionItem value="md" title="Primary section">
        <p class="body">size=md</p>
      </AccordionItem>
      <AccordionItem value="sm" title="Secondary section" size="sm">
        <p class="body">size=sm</p>
      </AccordionItem>
    </Accordion>
  </Specimen>
</SpecimenGrid>

<style>
  .body { margin: 0 0 var(--ds-space-sm); font-family: var(--ds-font-sans); font-size: var(--ds-text-sm); color: var(--ds-color-fg); }
  .body:last-child { margin-bottom: 0; }
  .form { display: flex; flex-direction: column; gap: var(--ds-space-sm); width: 100%; max-width: 28rem; }
</style>
