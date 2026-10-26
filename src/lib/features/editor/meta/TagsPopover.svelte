<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // No onCloseAutoFocus: closing this never hands focus back to the editor
  // content.
  import { Popover, Combobox, TriggerFace, Chip } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { addTag, removeTag } from './tags';

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
  // Combobox reports a value only on commit: blur, Enter or a suggestion.
  function commitTag(v: string | null) {
    tagDraft = '';
    const next = addTag(tags, v);
    if (next) onSetTags?.(next);
  }
</script>

<Popover bind:open side="bottom" align="start" class="tags-pop" triggerProps={{ title: m.editor_tags_trigger_title(), 'aria-label': m.editor_tags_trigger_title() }}>
  {#snippet trigger()}
    <TriggerFace variant="ghost" size="sm" icon><Icon name="tag" /></TriggerFace>
  {/snippet}
  <h3 class="tags-title">{m.editor_tags_title()}</h3>
  {#if tags.length > 0}
    <div class="chips">
      {#each tags as tag (tag)}
        <Chip label={tag} removeLabel={m.editor_tags_remove()} onRemove={() => onSetTags?.(removeTag(tags, tag))} />
      {/each}
    </div>
  {/if}
  <Combobox
    value={tagDraft}
    options={tagSuggestions}
    placeholder={m.editor_tags_placeholder()}
    onValueChange={commitTag}
    --combo-width="100%"
  />
</Popover>

<style>
  :global(.ds-popover-content.tags-pop) { width: 240px; padding: 0.7rem 0.8rem; }
  .tags-title { font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium); color: var(--ds-color-muted); margin: 0 0 0.5rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
</style>
