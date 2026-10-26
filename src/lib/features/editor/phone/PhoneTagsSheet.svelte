<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Suggestions are a row of buttons in the flow, not a Combobox dropdown:
  // BottomSheet's overflow:hidden clips an absolutely positioned dropdown.
  import { BottomSheet, Button, Chip, Input } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { addTag, removeTag } from '../meta/tags';

  let {
    tags = [],
    onSetTags,
    tagSuggestions = [],
    open = $bindable(false),
  }: {
    tags?: string[];
    onSetTags?: (tags: string[]) => void;
    tagSuggestions?: string[];
    open?: boolean;
  } = $props();

  let tagDraft = $state('');

  function commitTag(v: string | null) {
    tagDraft = '';
    const next = addTag(tags, v);
    if (next) onSetTags?.(next);
  }

  const availableSuggestions = $derived(
    tagSuggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
  );
</script>

<BottomSheet bind:open title={m.editor_tags_title()}>
  {#if tags.length > 0}
    <div class="m-tags-chips">
      {#each tags as tag (tag)}
        <Chip size="md" label={tag} removeLabel={m.editor_tags_remove()} onRemove={() => onSetTags?.(removeTag(tags, tag))} />
      {/each}
    </div>
  {/if}

  {#if availableSuggestions.length > 0}
    <div class="m-tags-suggestions">
      {#each availableSuggestions as s (s)}
        <Button size="sm" onclick={() => commitTag(s)}><Icon name="plus" size={14} />{s}</Button>
      {/each}
    </div>
  {/if}

  <div class="m-tags-add-row">
    <Input
      size="lg"
      placeholder={m.editor_tags_placeholder()}
      aria-label={m.editor_tags_placeholder()}
      value={tagDraft}
      oninput={(e: Event) => (tagDraft = (e.currentTarget as HTMLInputElement).value)}
      onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); commitTag(tagDraft); } }}
    />
    <Button variant="ghost" size="lg" icon title={m.editor_tags_add_aria()} aria-label={m.editor_tags_add_aria()} onclick={() => commitTag(tagDraft)}><Icon name="plus" /></Button>
  </div>
</BottomSheet>

<style>
  .m-tags-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.6rem; }
  .m-tags-suggestions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem; }
  .m-tags-add-row { display: flex; gap: 0.4rem; align-items: center; }
</style>
