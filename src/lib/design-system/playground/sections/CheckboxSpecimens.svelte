<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Checkbox from '../../Checkbox.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let a = $state(false);
  let b = $state(true);
  let members = $state<string[]>(['ada']);
  const people = [
    { id: 'ada', name: 'Ada Lovelace', email: 'ada@example.com' },
    { id: 'alan', name: 'Alan Turing', email: 'alan@example.com' },
    { id: 'grace', name: '', email: 'grace@example.com' },
  ];
  const all = $derived(members.length === people.length);
  const some = $derived(members.length > 0 && !all);
</script>

<SpecimenGrid title="States">
  <Specimen label="unchecked" state="unchecked">
    <Checkbox bind:checked={a}>Send a copy to me</Checkbox>
  </Specimen>
  <Specimen label="checked" state="checked">
    <Checkbox bind:checked={b}>Send a copy to me</Checkbox>
  </Specimen>
  <Specimen label="indeterminate (a partly-checked parent)" state="indeterminate">
    <Checkbox checked={false} indeterminate>Select all</Checkbox>
  </Specimen>
  <Specimen label="disabled, unchecked and checked" state="disabled">
    <Checkbox disabled>Unavailable</Checkbox>
    <Checkbox disabled checked>Locked on</Checkbox>
  </Specimen>
  <Specimen label="size=sm (a panel, a dense list)" state="sm">
    <Checkbox size="sm" checked>Keep this block</Checkbox>
  </Specimen>
  <Specimen label="ariaLabel only (no visible label)" state="aria-label">
    <Checkbox ariaLabel="Select row" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Grammar">
  <Specimen label="a member list: name + muted email in the label; the parent is indeterminate while some are picked; name + value post a list" state="list" wide>
    <form class="list" onsubmit={(e) => e.preventDefault()}>
      <Checkbox
        size="sm"
        checked={all}
        indeterminate={some}
        onCheckedChange={() => (members = all ? [] : people.map((p) => p.id))}
      >All people</Checkbox>
      <ul>
        {#each people as p (p.id)}
          <li>
            <Checkbox
              size="sm"
              name="members"
              value={p.id}
              checked={members.includes(p.id)}
              onCheckedChange={(on) => (members = on ? [...members, p.id] : members.filter((id) => id !== p.id))}
            >
              {p.name || p.email}{#if p.name}<span class="email">{p.email}</span>{/if}
            </Checkbox>
          </li>
        {/each}
      </ul>
    </form>
  </Specimen>
</SpecimenGrid>

<style>
  .list { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .list ul { list-style: none; margin: 0; padding: 0 0 0 var(--ds-space-md); display: flex; flex-direction: column; gap: 0.2rem; }
  .email { margin-left: 0.4rem; color: var(--ds-color-muted); font-size: var(--ds-text-xs); }
</style>
