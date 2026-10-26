<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Input from '../../Input.svelte';
  import Textarea from '../../Textarea.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let text = $state('Knowledge base');
  let long = $state('A value long enough to overflow the box and show that the input scrolls rather than grows');
  let notes = $state('First line\nSecond line');
</script>

<SpecimenGrid title="Input — sizes">
  <Specimen label="size=md (default)" state="md">
    <Input bind:value={text} aria-label="Title" />
  </Specimen>
  <Specimen label="size=sm (height-constrained rows)" state="sm">
    <Input size="sm" bind:value={text} aria-label="Title" />
  </Specimen>
  <Specimen label="size=lg (a touch sheet: 16px+ text, no iOS zoom)" state="lg">
    <Input size="lg" bind:value={text} aria-label="Title" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Input — states">
  <Specimen label="placeholder (empty)" state="placeholder">
    <Input value="" placeholder="Slug" aria-label="Slug" />
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <Input value="read only" disabled aria-label="Disabled" />
  </Specimen>
  <Specimen label="aria-invalid (error)" state="invalid">
    <Input value="not a slug!" aria-invalid="true" aria-describedby="pg-input-err" aria-label="Slug" />
    <span id="pg-input-err" class="err">Only lowercase letters, digits and hyphens.</span>
  </Specimen>
  <Specimen label="long value" state="long">
    <Input bind:value={long} aria-label="Long value" />
  </Specimen>
  <Specimen label="type=password" state="password">
    <Input type="password" value="hunter2" aria-label="Password" />
  </Specimen>
  <Specimen label="type=number" state="number">
    <Input type="number" value="42" aria-label="Count" />
  </Specimen>
  <Specimen label="type=email" state="email">
    <Input type="email" value="" placeholder="name@example.org" aria-label="Email" />
  </Specimen>
  <Specimen label="with visible label (for)" state="labelled">
    <label class="lbl" for="pg-input-labelled">Display name</label>
    <Input id="pg-input-labelled" value="Alex" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Textarea">
  <Specimen label="default (rows=4)" state="textarea">
    <Textarea bind:value={notes} aria-label="Notes" />
  </Specimen>
  <Specimen label="rows=2, placeholder" state="textarea-short">
    <Textarea value="" rows={2} placeholder="Optional description" aria-label="Description" />
  </Specimen>
  <Specimen label="disabled" state="textarea-disabled">
    <Textarea value="Locked" disabled aria-label="Locked" />
  </Specimen>
  <Specimen label="aria-invalid (error)" state="textarea-invalid">
    <Textarea value="" aria-invalid="true" aria-label="Required" />
  </Specimen>
</SpecimenGrid>

<style>
  .err { font-size: var(--ds-text-sm); color: var(--ds-color-danger); }
  .lbl { font-size: var(--ds-text-sm); color: var(--ds-color-fg); }
</style>
