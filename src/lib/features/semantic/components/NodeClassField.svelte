<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A short closed list, so a native select. Only the node's type and the
  // classes under it are offered: the hierarchy bounds what a node can be
  // (docs/architecture/semantic-layer.md).
  import { untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { FormField } from '$lib/design-system';
  import type { NodeClassOption } from '../nodeClass';

  let {
    nodeClassId = null,
    nodeClasses = [],
    onSetNodeClass,
  }: {
    nodeClassId?: string | null;
    // Every assignable class (types + domain classes); narrowed below.
    nodeClasses?: NodeClassOption[];
    onSetNodeClass?: (id: string | null) => Promise<{ ok: boolean; error?: string } | undefined>;
  } = $props();

  let current = $state<string | null>(untrack(() => nodeClassId));
  // The reconcile half of the optimistic update: resync to a fresh value.
  $effect(() => {
    current = nodeClassId;
  });
  const currentClass = $derived(nodeClasses.find((c) => c.id === current) ?? null);
  // A node is at least its type, so the current class always names it.
  const nodeType = $derived(currentClass?.nodeType ?? null);
  const options = $derived(
    nodeClasses
      .filter((c) => nodeType === null || c.nodeType === nodeType)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'type' ? -1 : 1))
  );
  let error = $state<string | null>(null);

  async function choose(value: string) {
    const id = value || null;
    if (id === current) return;
    const prev = current;
    current = id; // optimistic
    error = null;
    const res = await onSetNodeClass?.(id);
    if (res && !res.ok) {
      current = prev;
      error = res.error ?? null;
    }
  }
</script>

<div class="class-field">
  <FormField
    label={m.editor_class_field_label()}
    hint={options.length > 0 ? (currentClass?.description ?? undefined) : m.editor_class_empty()}
    {error}
    group={options.length === 0}
  >
    {#snippet children(field)}
      {#if options.length > 0}
        <!-- ui-check-allow: raw-element — a short closed list the node-classes spec drives with selectOption -->
        <select
          id={field.controlId}
          aria-describedby={field.describedBy}
          aria-invalid={field.invalid ? 'true' : undefined}
          class="class-select"
          value={current ?? ''}
          disabled={!onSetNodeClass}
          onchange={(e) => choose(e.currentTarget.value)}
        >
          {#each options as c (c.id)}
            <option value={c.id}>{c.label}</option>
          {/each}
        </select>
      {/if}
    {/snippet}
  </FormField>
</div>

<style>
  .class-field { margin: 0 0 0.9rem; }
  .class-select { height: var(--ds-control-h-md); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-sm); background: none; color: var(--ds-color-fg); font: inherit; font-size: var(--ds-text-field-md); padding: 0 0.5rem; }
  .class-select[aria-invalid='true'] { border-color: var(--ds-color-danger); }
</style>
