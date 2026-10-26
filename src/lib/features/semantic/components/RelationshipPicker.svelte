<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Select, Input } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { MEMBERSHIP_RELATIONSHIP } from '../membership';

  type RelType = { slug: string; label: string; inverseLabel: string | null; properties: { name: string; label: string; datatype: string }[] };

  // Opt-in typing of a quick link's edge, through the generic onUpdateAttr.
  let { relationshipType, properties, onUpdateAttr }: {
    relationshipType: string | null;
    properties: Record<string, string>;
    onUpdateAttr: (attr: string, value: unknown) => void;
  } = $props();

  let types = $state<RelType[]>([]);

  onMount(async () => {
    try {
      const res = await fetch('/api/relationship-types');
      // A refusal offers nothing to pick, as a failure does.
      types = res.ok ? ((await res.json()).results ?? []) : [];
    } catch {
      types = [];
    }
  });

  // A collection's membership is its own (membership.ts): no quick link makes one.
  const items = $derived([
    { value: '', label: m.relationship_picker_none() },
    ...types.filter((t) => t.slug !== MEMBERSHIP_RELATIONSHIP).map((t) => ({ value: t.slug, label: t.label })),
  ]);
  const active = $derived(types.find((t) => t.slug === relationshipType) ?? null);

  function setType(slug: string) {
    // The old values belong to the old type's fields: a type change resets them.
    onUpdateAttr('relationshipType', slug || null);
    onUpdateAttr('properties', {});
  }

  function setProperty(name: string, value: string) {
    onUpdateAttr('properties', { ...properties, [name]: value });
  }
</script>

<p class="prop-label">{m.relationship_picker_label()}</p>
<Select items={items} value={relationshipType ?? ''} onValueChange={setType} ariaLabel={m.relationship_picker_label()} />
<p class="prop-hint">{m.relationship_picker_hint()}</p>

{#if active && active.properties.length > 0}
  <p class="prop-label">{m.relationship_picker_properties_label()}</p>
  {#each active.properties as prop (prop.name)}
    <label class="prop-row">
      <span>{prop.label}</span>
      <Input value={properties[prop.name] ?? ''} onchange={(e: Event) => setProperty(prop.name, (e.currentTarget as HTMLInputElement).value)} />
    </label>
  {/each}
{/if}

<style>
  .prop-row { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--ds-color-muted); margin-bottom: 0.5rem; }
</style>
