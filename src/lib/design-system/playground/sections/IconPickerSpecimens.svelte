<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import IconPickerField from '../../IconPickerField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let unset = $state<string | null>(null);
  let set = $state<string | null>('bookmark');
  let picked = $state<string | null>('star');
</script>

<SpecimenGrid title="States" narrow>
  <Specimen label="unset (∅ + noneLabel)" state="unset">
    <IconPickerField value={unset} onValueChange={(ic) => (unset = ic)} noneLabel="None" noneTitle="No icon" ariaLabel="Icon" />
  </Specimen>
  <Specimen label="set to a quick-link icon" state="set">
    <IconPickerField value={set} onValueChange={(ic) => (set = ic)} noneLabel="None" noneTitle="No icon" ariaLabel="Icon" />
    <span class="val">value: {set ?? 'null'}</span>
  </Specimen>
  <Specimen label="trigger opens the grid (closes on a pick)" state="open" overlay>
    <IconPickerField value={picked} onValueChange={(ic) => (picked = ic)} noneLabel="None" noneTitle="No icon" ariaLabel="Icon" />
  </Specimen>
</SpecimenGrid>

<style>
  .val { font-size: var(--ds-text-sm); color: var(--ds-color-muted); font-family: var(--ds-font-mono); }
</style>
