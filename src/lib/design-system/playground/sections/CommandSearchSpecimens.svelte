<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Command from '../../Command.svelte';
  import CommandSearch from '../../CommandSearch.svelte';
  import CommandList from '../../CommandList.svelte';
  import CommandItem from '../../CommandItem.svelte';
  import Popover from '../../Popover.svelte';
  import TriggerFace from '../../TriggerFace.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const places = [
    { value: 'getting-started', label: 'Getting started', where: 'Page · Handbook' },
    { value: 'release-notes', label: 'Release notes', where: 'Document · Handbook' },
    { value: 'archive', label: 'Archive', where: 'Collection · Handbook', reason: 'Its integration is turned off', disabled: true },
    { value: 'roadmap', label: 'Roadmap', where: 'Page · Product' },
  ];

  let emptyQuery = $state('');
  let typedQuery = $state('release');
  let listQuery = $state('');
  let popoverQuery = $state('');
  let log = $state('nothing picked yet');

  const matches = $derived(places.filter((p) => p.label.toLowerCase().includes(listQuery.trim().toLowerCase())));
</script>

<SpecimenGrid title="The field">
  <Specimen label="size=md, empty" state="md-empty">
    <Command ariaLabel="Find a page" shouldFilter={false}>
      <CommandSearch bind:value={emptyQuery} placeholder="Search pages…" clearLabel="Clear search" />
    </Command>
  </Specimen>
  <Specimen label="size=lg, typed (the clear button shows)" state="lg-typed">
    <Command ariaLabel="Find a page" shouldFilter={false}>
      <CommandSearch bind:value={typedQuery} placeholder="Search pages…" clearLabel="Clear search" size="lg" />
    </Command>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="With CommandList (the box belongs to the specimen, not the primitive)">
  <Specimen label="arrows move through the matches and skip the disabled row, which stays readable and says why" state="list" wide>
    <div class="box">
      <Command ariaLabel="Find a place" shouldFilter={false} vimBindings={false}>
        <CommandSearch bind:value={listQuery} placeholder="Search titles…" clearLabel="Clear search" size="lg" />
        <div class="results">
        <CommandList ariaLabel="Matches">
          {#each matches as place (place.value)}
            <CommandItem value={place.value} disabled={place.disabled ?? false} onSelect={() => (log = place.label)}>
              <span class="row">
                <span class="text">
                  <span class="title">{place.label}</span>
                  <span class="where">{place.where}</span>
                </span>
                {#if place.reason}<span class="reason">{place.reason}</span>{/if}
              </span>
            </CommandItem>
          {/each}
        </CommandList>
        </div>
        {#if matches.length === 0}<p class="empty">No title contains “{listQuery}”.</p>{/if}
      </Command>
    </div>
    <p class="log">onSelect: {log}</p>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="In a layer">
  <Specimen label="inside a Popover: Escape clears a typed term first, then closes" state="in-popover" overlay>
    <Popover>
      {#snippet trigger()}<TriggerFace variant="secondary"><Icon name="search" size={16} />Find</TriggerFace>{/snippet}
      <div class="panel">
        <Command ariaLabel="Find a page" shouldFilter={false} vimBindings={false}>
          <CommandSearch bind:value={popoverQuery} placeholder="Search pages…" clearLabel="Clear search" autofocus />
          <CommandList ariaLabel="Matches">
            {#each places.filter((p) => !p.disabled && p.label.toLowerCase().includes(popoverQuery.trim().toLowerCase())) as place (place.value)}
              <CommandItem value={place.value} onSelect={() => (log = place.label)}>{place.label}</CommandItem>
            {/each}
          </CommandList>
        </Command>
      </div>
    </Popover>
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
  /* Not height-capped: axe's scrollable-region-focusable flags a scrolling
     listbox whose options take no focus. */
  .results { padding-top: var(--ds-space-sm); }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ds-space-sm); min-width: 0; }
  .text { display: flex; flex-direction: column; flex: 1 1 10rem; min-width: 0; }
  .title { font-size: var(--ds-text-md); overflow-wrap: anywhere; }
  .where { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  /* The reason at full contrast, whatever the disabled row's colour. */
  .reason { font-size: var(--ds-text-sm); color: var(--ds-color-fg); }
  .empty { margin: 0; padding: var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .panel { width: 18rem; max-width: 100%; }
  .log { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
