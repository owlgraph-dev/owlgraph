<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Opens a page of the sheet around it instead of a dialog of its own.
  import Button from '../../Button.svelte';
  import { getSheetPageOutlet } from '../../sheetPage';

  const outlet = getSheetPageOutlet();
  let picking = $state(false);
  let chosen = $state('none');

  $effect(() => {
    if (!picking || !outlet) return;
    return outlet.show({ title: 'Pick a colour', backLabel: 'Back', onBack: () => (picking = false), body: page });
  });

  function pick(color: string) {
    chosen = color;
    picking = false;
  }
</script>

{#snippet page()}
  <div class="colors">
    {#each ['Red', 'Green', 'Blue'] as color (color)}
      <Button variant="secondary" onclick={() => pick(color)}>{color}</Button>
    {/each}
  </div>
{/snippet}

<p class="chosen">Colour: {chosen}</p>
<Button onclick={() => (picking = true)}>Choose a colour…</Button>

<style>
  .colors { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .chosen { margin: var(--ds-space-sm) 0; font-size: var(--ds-text-md); color: var(--ds-color-fg); }
</style>
