<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Bits UI's own filtering, with the bare CommandInput; the framed field is
  // CommandSearch's section.
  import { Command as BitsCommand } from 'bits-ui';
  import Command from '../../Command.svelte';
  import CommandInput from '../../CommandInput.svelte';
  import CommandList from '../../CommandList.svelte';
  import CommandItem from '../../CommandItem.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // `value` doubles as the filter text, so it is the visible label.
  const commands = [
    { value: 'New page', hint: 'Create a page in this namespace' },
    { value: 'New document', hint: 'Upload a PDF or markdown file' },
    { value: 'Open graph', hint: 'Show the local graph of the current page' },
    { value: 'Toggle sidebar', hint: 'Show or hide the utility sidebar' },
    { value: 'Rename page', hint: 'Change the title and slug' },
    { value: 'Publish', hint: 'Make the latest revision public', disabled: true },
    { value: 'Settings', hint: 'Open Settings' },
    { value: 'Sign out', hint: 'End the current session' },
  ];

  let selected = $state('');
  let query = $state('');
  let log = $state('nothing selected yet');
</script>

<SpecimenGrid title="Filterable list (the bordered box belongs to the specimen, not the primitive)">
  <Specimen label="Command + CommandInput + CommandList + CommandItem; Command.Empty unwrapped; one disabled item" state="list" wide>
    <div class="box">
      <Command bind:value={selected} ariaLabel="Commands">
        <div class="bar">
          <Icon name="search" size={16} />
          <!-- CommandInput, unlike CommandSearch, does not read the list from the Command. -->
          <CommandInput bind:value={query} placeholder="Type a command…" aria-controls="pg-command-list" />
        </div>
        <div class="list">
          <CommandList ariaLabel="Commands">
            <BitsCommand.Empty>
              {#snippet child({ props: emptyProps }: { props: Record<string, unknown> })}
                <div {...emptyProps} class="empty">No command matches “{query}”.</div>
              {/snippet}
            </BitsCommand.Empty>
            {#each commands as c (c.value)}
              <CommandItem value={c.value} disabled={c.disabled ?? false} onSelect={() => (log = c.value)}>
                <span class="label">{c.value}</span>
                <span class="hint">{c.hint}</span>
              </CommandItem>
            {/each}
          </CommandList>
        </div>
      </Command>
    </div>
    <p class="log">onSelect: {log} · highlighted value: {selected || '—'}</p>
  </Specimen>
</SpecimenGrid>

<style>
  .box {
    max-width: 28rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
    background: var(--ds-color-bg);
    padding: var(--ds-space-sm);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    padding: 0 var(--ds-space-sm);
    border-bottom: 1px solid var(--ds-color-border);
    color: var(--ds-color-muted);
  }
  /* Not height-capped: axe's scrollable-region-focusable flags a scrolling
     listbox whose options take no focus. */
  .list { padding-top: var(--ds-space-sm); }
  .empty { padding: var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .label { font-size: var(--ds-text-md); }
  .hint { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .log { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
