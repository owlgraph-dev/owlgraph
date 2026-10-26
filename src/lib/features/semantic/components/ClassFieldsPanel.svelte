<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // With more than one group on the class chain contributing, each gets a
  // caption naming the class it's inherited from, so an invoice's Documents
  // fields read as inherited (docs/architecture/semantic-layer.md).
  import { untrack } from 'svelte';
  import { Input, Textarea, EmptyState } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { ClassPropertySlot } from '../propertyGroups';
  import type { ClassFieldGroup } from '../nodeClass';

  let {
    groupLabel = '',
    slots,
    groups = [],
    ownClassId = null,
    onSetField,
    heading = true,
    layout = 'grid',
  }: {
    groupLabel?: string;
    slots: ClassPropertySlot[];
    // Nearest first.
    groups?: ClassFieldGroup[];
    ownClassId?: string | null;
    onSetField: (name: string, value: string) => void;
    heading?: boolean;
    layout?: 'grid' | 'stack';
  } = $props();

  // Resynced from `slots` after a commit, not per keystroke. The $effect runs
  // after render, so a slot that appears mid-session has no draft at first: the
  // bindings fall back to its value (Input throws on bind:value={undefined}).
  let drafts = $state<Record<string, string>>(untrack(() => Object.fromEntries(slots.map((s) => [s.name, s.value]))));
  $effect(() => {
    drafts = Object.fromEntries(slots.map((s) => [s.name, s.value]));
  });
  const draftOf = (slot: ClassPropertySlot) => drafts[slot.name] ?? slot.value;

  // A definition's description is the field's hint.
  const uid = $props.id();
  const hintId = (slot: ClassPropertySlot) => `${uid}-hint-${slot.name}`;

  function commit(slot: ClassPropertySlot) {
    const draft = draftOf(slot);
    if (draft.trim() === slot.value) return;
    onSetField(slot.name, draft);
  }

  // A property name is always "group:name", so the group is its prefix.
  const groupOf = (name: string) => name.slice(0, name.indexOf(':'));

  // One caption-less section when a single group contributes. Long-form fields
  // get full-width multi-line rows of their own.
  type Section = { caption: string | null; inheritedFrom: string | null; short: ClassPropertySlot[]; long: ClassPropertySlot[] };
  const sections = $derived.by((): Section[] => {
    const split = (list: ClassPropertySlot[]) => ({ short: list.filter((s) => s.datatype !== 'longtext'), long: list.filter((s) => s.datatype === 'longtext') });
    const contributing = groups.filter((g) => slots.some((s) => groupOf(s.name) === g.slug));
    if (contributing.length <= 1) return [{ caption: null, inheritedFrom: null, ...split(slots) }];
    return contributing.map((g) => ({
      caption: g.label,
      inheritedFrom: ownClassId && g.fromClass.id !== ownClassId ? g.fromClass.label : null,
      ...split(slots.filter((s) => groupOf(s.name) === g.slug)),
    }));
  });
</script>

<section class="props-panel" class:stack={layout === 'stack'}>
  {#if heading}
    <h2>{groupLabel || m.editor_class_fields_heading()}</h2>
  {/if}
  {#if slots.length === 0}
    <EmptyState size="sm">{m.editor_class_fields_empty()}</EmptyState>
  {/if}
  {#each sections as section, i (section.caption ?? i)}
    {#if section.caption}
      <h3 class="group-caption">
        {section.caption}
        {#if section.inheritedFrom}<span class="inherited">{m.editor_class_fields_inherited_from({ class: section.inheritedFrom })}</span>{/if}
      </h3>
    {/if}
    <div class="fields">
      {#each section.short as s (s.name)}
        <div class="field">
          <label>
            {s.label}
            <Input
              class="class-field-in"
              bind:value={() => draftOf(s), (v) => (drafts[s.name] = v)}
              aria-describedby={s.description ? hintId(s) : undefined}
              onblur={() => commit(s)}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              }}
            />
          </label>
          {#if s.description}<span class="hint" id={hintId(s)}>{s.description}</span>{/if}
        </div>
      {/each}
    </div>
    {#each section.long as s (s.name)}
      <div class="field long-field">
        <label>
          {s.label}
          <Textarea
            class="class-field-in"
            bind:value={() => draftOf(s), (v) => (drafts[s.name] = v)}
            aria-describedby={s.description ? hintId(s) : undefined}
            rows={layout === 'stack' ? 3 : 5}
            onblur={() => commit(s)}
          />
        </label>
        {#if s.description}<span class="hint" id={hintId(s)}>{s.description}</span>{/if}
      </div>
    {/each}
  {/each}
</section>

<style>
  .props-panel { margin: 0 0 1.5rem; }
  .props-panel.stack { margin: 0; }
  h2 { margin: 0 0 0.6rem; font-size: 0.95rem; }
  .group-caption { margin: 0.9rem 0 0.4rem; font-size: 0.78rem; font-weight: 600; color: var(--ds-color-muted); display: flex; gap: 0.5rem; align-items: baseline; }
  .group-caption:first-of-type { margin-top: 0; }
  .stack .group-caption { margin-top: 0.6rem; }
  .inherited { font-weight: 400; font-size: var(--ds-text-xs); }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .stack .fields { grid-template-columns: 1fr; gap: 0.5rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--ds-color-muted); }
  label :global(.class-field-in) { width: 100%; box-sizing: border-box; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  .hint { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .long-field { margin-top: 0.9rem; }
  .stack .long-field { margin-top: 0.5rem; }
</style>
