<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Block attrs, not capabilities: they hold for every viewport
  // (docs/architecture/blocks/node-embeds.md, "Collection and document blocks").
  import { onDestroy } from 'svelte';
  import { Button, FieldRow, NumberField, SegmentedControl, SegmentedControlItem, Switch } from '$lib/design-system';
  import { collectionConfig, MAX_COLLECTION_LIMIT, type CollectionBlockData } from '$lib/features/content';
  import type { NodeSearchResult } from '$lib/features/search';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import { NodePicker } from '$lib/features/search/picker';
  import type { BlockSettingsProps } from '../../blockSettings/types';
  import { collectionEmbeds } from '../../core/embeds';
  import { embedMark, embedRowAction, pickEmbed } from '../embedPicker';

  let { target, editor, actions }: BlockSettingsProps = $props();

  const config = $derived(collectionConfig(target.attrs));
  let picking = $state(false);

  // The open picker is the editor's open overlay (its Escape handling), and
  // closes with the panel.
  function setPicking(open: boolean) {
    if (open === picking) return;
    picking = open;
    actions.overlayOpenChange?.(open);
  }
  onDestroy(() => setPicking(false));

  let data = $state<CollectionBlockData | undefined>(undefined);
  $effect(() => {
    const id = config.nodeId;
    data = undefined;
    if (!id) return;
    return collectionEmbeds.watch(id, (next) => (data = next));
  });

  const chosen = $derived(
    !config.nodeId ? m.editor_embed_none() : data === undefined ? m.editor_embed_loading() : data.state === 'hidden' ? m.editor_embed_hidden() : data.node.title
  );

  const namespace = $derived(actions.createIn?.() ?? null);

  const MODIFIED_KEYS = ['limit', 'density', 'showLabels', 'columns'];
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, MODIFIED_KEYS)}>
  <FieldRow layout="stack" label={m.editor_embed_collection()}>
    <span class="es-chosen">{chosen}</span>
    <span class="es-pick">
      <Button size="sm" variant="secondary" onclick={() => setPicking(true)}>{config.nodeId ? m.editor_embed_change() : m.editor_embed_choose()}</Button>
    </span>
  </FieldRow>
  <FieldRow label={m.editor_embed_limit()} info={m.editor_embed_limit_info()}>
    <NumberField
      size="sm"
      value={config.limit}
      min={1}
      max={MAX_COLLECTION_LIMIT}
      ariaLabel={m.editor_embed_limit()}
      onValueChange={(v) => v !== null && target.update({ limit: Math.min(Math.max(Math.round(v), 1), MAX_COLLECTION_LIMIT) })}
    />
  </FieldRow>
  <FieldRow layout="stack" label={m.editor_embed_density()}>
    <SegmentedControl type="single" size="sm" stretch value={config.density} ariaLabel={m.editor_embed_density()}>
      <SegmentedControlItem value="compact" onclick={() => target.update({ density: 'compact' })}>{m.editor_embed_density_compact()}</SegmentedControlItem>
      <SegmentedControlItem value="normal" onclick={() => target.update({ density: 'normal' })}>{m.editor_embed_density_normal()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  <FieldRow label={m.editor_embed_labels()}>
    <Switch size="sm" checked={config.showLabels} onCheckedChange={(v) => target.update({ showLabels: v })} ariaLabel={m.editor_embed_labels()} />
  </FieldRow>
  <FieldRow label={m.editor_embed_column_kind()}>
    <Switch size="sm" checked={config.columns.includes('kind')} onCheckedChange={(v) => target.update({ columns: v ? null : [] })} ariaLabel={m.editor_embed_column_kind()} />
  </FieldRow>
</BlockSettingsSection>

<NodePicker
  open={picking}
  onOpenChange={setPicking}
  title={m.editor_embed_pick_collection()}
  placeholder={m.editor_embed_pick_collection_placeholder()}
  types={['collection']}
  mark={(node: NodeSearchResult) => embedMark('collection', node, actions, config.nodeId)}
  rowAction={(node: NodeSearchResult) => embedRowAction('collection', node, actions)}
  create={namespace ? { types: ['collection'], namespace } : undefined}
  onPick={(node: NodeSearchResult) => pickEmbed('collection', node, target, actions)}
/>

<style>
  .es-chosen { display: block; font-size: var(--ds-text-sm); color: var(--ds-color-fg); overflow-wrap: anywhere; }
  .es-pick { display: block; margin-top: calc(var(--ds-space-sm) / 2); }
</style>
