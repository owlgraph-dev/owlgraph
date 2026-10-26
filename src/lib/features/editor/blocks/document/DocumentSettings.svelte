<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Block attrs, not capabilities: they hold for every viewport
  // (docs/architecture/blocks/node-embeds.md, "Collection and document blocks").
  import { onDestroy } from 'svelte';
  import { Button, FieldRow, SegmentedControl, SegmentedControlItem, Select, Switch } from '$lib/design-system';
  import { documentConfig, type DocumentBlockData, type DocumentTitleMode } from '$lib/features/content';
  import type { NodeSearchResult } from '$lib/features/search';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import { NodePicker } from '$lib/features/search/picker';
  import type { BlockSettingsProps } from '../../blockSettings/types';
  import { documentEmbeds } from '../../core/embeds';
  import { embedMark, embedRowAction, pickEmbed } from '../embedPicker';

  let { target, editor, actions }: BlockSettingsProps = $props();

  const config = $derived(documentConfig(target.attrs));
  let picking = $state(false);

  // The open picker is the editor's open overlay (its Escape handling), and
  // closes with the panel.
  function setPicking(open: boolean) {
    if (open === picking) return;
    picking = open;
    actions.overlayOpenChange?.(open);
  }
  onDestroy(() => setPicking(false));

  let data = $state<DocumentBlockData | undefined>(undefined);
  $effect(() => {
    const id = config.nodeId;
    data = undefined;
    if (!id) return;
    return documentEmbeds.watch(id, (next) => (data = next));
  });

  const chosen = $derived(
    !config.nodeId ? m.editor_embed_none() : data === undefined ? m.editor_embed_loading() : data.state === 'hidden' ? m.editor_embed_hidden() : data.node.title
  );

  const titleItems = $derived([
    { value: 'auto', label: m.editor_embed_title_auto() },
    { value: 'node', label: m.editor_embed_title_node() },
    { value: 'filename', label: m.editor_embed_title_filename() },
  ]);

  const namespace = $derived(actions.createIn?.() ?? null);

  const MODIFIED_KEYS = ['variant', 'titleMode', 'preview', 'showMeta', 'showDownload', 'showNodeLink'];
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, MODIFIED_KEYS)}>
  <FieldRow layout="stack" label={m.editor_embed_document()}>
    <span class="es-chosen">{chosen}</span>
    <span class="es-pick">
      <Button size="sm" variant="secondary" onclick={() => setPicking(true)}>{config.nodeId ? m.editor_embed_change() : m.editor_embed_choose()}</Button>
    </span>
  </FieldRow>
  <FieldRow layout="stack" label={m.editor_embed_variant()}>
    <SegmentedControl type="single" size="sm" stretch value={config.variant} ariaLabel={m.editor_embed_variant()}>
      <SegmentedControlItem value="row" onclick={() => target.update({ variant: 'row' })}>{m.editor_embed_variant_row()}</SegmentedControlItem>
      <SegmentedControlItem value="card" onclick={() => target.update({ variant: 'card' })}>{m.editor_embed_variant_card()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  <FieldRow layout="stack" label={m.editor_embed_title()} info={m.editor_embed_title_info()}>
    <Select size="sm" width="full" items={titleItems} value={config.titleMode} ariaLabel={m.editor_embed_title()} onValueChange={(v) => target.update({ titleMode: v as DocumentTitleMode })} />
  </FieldRow>
  {#if config.variant === 'card'}
    <FieldRow label={m.editor_embed_preview()}>
      <Switch size="sm" checked={config.preview === 'auto'} onCheckedChange={(v) => target.update({ preview: v ? 'auto' : 'none' })} ariaLabel={m.editor_embed_preview()} />
    </FieldRow>
  {/if}
  <FieldRow label={m.editor_embed_meta()}>
    <Switch size="sm" checked={config.showMeta} onCheckedChange={(v) => target.update({ showMeta: v })} ariaLabel={m.editor_embed_meta()} />
  </FieldRow>
  <FieldRow label={m.editor_embed_download()}>
    <Switch size="sm" checked={config.showDownload} onCheckedChange={(v) => target.update({ showDownload: v })} ariaLabel={m.editor_embed_download()} />
  </FieldRow>
  <FieldRow label={m.editor_embed_node_link()}>
    <Switch size="sm" checked={config.showNodeLink} onCheckedChange={(v) => target.update({ showNodeLink: v })} ariaLabel={m.editor_embed_node_link()} />
  </FieldRow>
</BlockSettingsSection>

<NodePicker
  open={picking}
  onOpenChange={setPicking}
  title={m.editor_embed_pick_document()}
  placeholder={m.editor_embed_pick_document_placeholder()}
  types={['document']}
  mark={(node: NodeSearchResult) => embedMark('document', node, actions, config.nodeId)}
  rowAction={(node: NodeSearchResult) => embedRowAction('document', node, actions)}
  create={namespace ? { types: ['document'], namespace } : undefined}
  onPick={(node: NodeSearchResult) => pickEmbed('document', node, target, actions)}
/>

<style>
  .es-chosen { display: block; font-size: var(--ds-text-sm); color: var(--ds-color-fg); overflow-wrap: anywhere; }
  .es-pick { display: block; margin-top: calc(var(--ds-space-sm) / 2); }
</style>
