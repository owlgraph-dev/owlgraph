<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A node's classes, any number of them. Only the classes under the node's
  // type are offered: the hierarchy bounds what a node can be, and with none
  // chosen it is its type alone (docs/architecture/semantic-layer.md).
  import { untrack } from 'svelte';
  import * as m from '#lib/paraglide/messages.js';
  import { FormField, MultiSelect } from '#lib/design-system/index.ts';
  import type { NodeClassOption } from '../nodeClass';

  let {
    nodeClassIds = [],
    nodeClasses = [],
    onSetNodeClasses,
  }: {
    // Every class the node has: its own, or its type class alone.
    nodeClassIds?: string[];
    // Every assignable class (types + domain classes); narrowed below.
    nodeClasses?: NodeClassOption[];
    onSetNodeClasses?: (ids: string[]) => Promise<{ ok: boolean; error?: string } | undefined>;
  } = $props();

  let current = $state<string[]>(untrack(() => nodeClassIds));
  // The reconcile half of the optimistic update: resync to a fresh value.
  $effect(() => {
    current = nodeClassIds;
  });
  // A node always has a class until the type classes go, so its classes name its type.
  const nodeType = $derived(nodeClasses.find((c) => current.includes(c.id))?.nodeType ?? null);
  const typeClass = $derived(nodeClasses.find((c) => c.kind === 'type' && c.nodeType === nodeType) ?? null);
  const options = $derived(nodeClasses.filter((c) => c.kind === 'domain' && (nodeType === null || c.nodeType === nodeType)));
  const chosen = $derived(options.filter((c) => current.includes(c.id)));
  let error = $state<string | null>(null);

  async function choose(ids: string[]) {
    const prev = current;
    current = ids; // optimistic
    error = null;
    const res = await onSetNodeClasses?.(ids);
    if (res && !res.ok) {
      current = prev;
      error = res.error ?? null;
    }
  }
</script>

<div class="class-field">
  <FormField
    label={m.editor_class_field_label()}
    hint={options.length === 0 ? m.editor_class_empty() : chosen.length === 1 ? chosen[0].description || undefined : undefined}
    {error}
    group={options.length === 0}
  >
    {#if options.length > 0}
      <MultiSelect
        items={options.map((c) => ({ value: c.id, label: c.label }))}
        value={chosen.map((c) => c.id)}
        onValueChange={choose}
        placeholder={typeClass?.label ?? ''}
        disabled={!onSetNodeClasses}
        invalid={!!error}
        width="full"
      />
    {/if}
  </FormField>
</div>

<style>
  .class-field { margin: 0 0 0.9rem; }
</style>
