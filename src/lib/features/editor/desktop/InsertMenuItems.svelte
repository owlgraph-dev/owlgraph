<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Shared by the toolbar's "+" and a placeholder's "+": `target` says whether
  // a command inserts near the cursor or replaces a node in place. Embedding
  // blocks are grouped by family (docs/architecture/blocks/node-embeds.md, "One family in the editor").
  import { DropdownMenuGroup, DropdownMenuGroupHeading, DropdownMenuItem, DropdownMenuSeparator } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import type { InsertTarget } from '$lib/features/content/editor';
  import { embedKindOf, newCollectionNode, newDocumentNode, type EmbedFamily } from '$lib/features/content';
  import { pluginOfBlockKind } from '$lib/plugins';
  import { PLUGIN_INSERT_ITEMS } from '$lib/plugins/editor';
  import type { InsertCommands } from '../commands/insert';
  import * as m from '$lib/paraglide/messages';

  let {
    target,
    enabledPlugins,
    commands,
    onSelect,
  }: {
    target: InsertTarget;
    /** The plugins turned on (their ids): the menu offers their blocks. */
    enabledPlugins: ReadonlySet<string>;
    commands: InsertCommands;
    onSelect: () => void;
  } = $props();

  // A plugin kind of no family goes under "Integrations".
  const pluginItems = $derived(PLUGIN_INSERT_ITEMS.filter((item) => enabledPlugins.has(pluginOfBlockKind(item.kind) ?? '')));
  const familyItems = (family: EmbedFamily) => pluginItems.filter((item) => embedKindOf(item.kind)?.family === family);
  const otherItems = $derived(pluginItems.filter((item) => !embedKindOf(item.kind)));

  const FAMILIES = [
    {
      family: 'collection',
      heading: m.editor_insert_menu_collection,
      core: { label: m.editor_insert_menu_collection_curated, title: m.editor_insert_menu_collection_title, icon: 'list-ordered', node: newCollectionNode },
    },
    {
      family: 'document',
      heading: m.editor_insert_menu_document,
      core: { label: m.editor_insert_menu_document_file, title: m.editor_insert_menu_document_title, icon: 'file', node: newDocumentNode },
    },
  ] as const;
</script>

<DropdownMenuItem onSelect={() => { commands.callout(target); onSelect(); }}>
  <span class="menu-item-row"><Icon name="info" /><span>{m.editor_insert_menu_callout()}</span></span>
</DropdownMenuItem>
<DropdownMenuItem onSelect={() => { commands.table(target); onSelect(); }}>
  <span class="menu-item-row"><Icon name="table" /><span>{m.editor_insert_menu_table()}</span></span>
</DropdownMenuItem>
<DropdownMenuItem onSelect={() => { commands.diagram(target); onSelect(); }}>
  <span class="menu-item-row"><Icon name="diagram" /><span>{m.editor_insert_menu_diagram()}</span></span>
</DropdownMenuItem>
<DropdownMenuItem onSelect={() => { commands.query(target); onSelect(); }}>
  <span class="menu-item-row"><Icon name="search" /><span>{m.editor_insert_menu_query()}</span></span>
</DropdownMenuItem>
<DropdownMenuItem onSelect={() => { commands.html(target); onSelect(); }}>
  <span class="menu-item-row"><Icon name="code" /><span>{m.editor_insert_menu_html_embed()}</span></span>
</DropdownMenuItem>
<DropdownMenuItem onSelect={() => { commands.quickLink(target); onSelect(); }}>
  <span class="menu-item-row"><Icon name="link" /><span>{m.editor_insert_menu_quick_link()}</span></span>
</DropdownMenuItem>
<DropdownMenuSeparator />
{#each FAMILIES as f (f.family)}
  <DropdownMenuGroup>
    <DropdownMenuGroupHeading>{f.heading()}</DropdownMenuGroupHeading>
    <DropdownMenuItem onSelect={() => { commands.block(target, f.core.node()); onSelect(); }}>
      <span class="menu-item-row" title={f.core.title()}><Icon name={f.core.icon} /><span>{f.core.label()}</span></span>
    </DropdownMenuItem>
    {#each familyItems(f.family) as item (item.kind)}
      <DropdownMenuItem onSelect={() => { commands.block(target, item.node()); onSelect(); }}>
        <span class="menu-item-row" title={item.title?.()}><Icon name={item.icon} /><span>{item.label()}</span></span>
      </DropdownMenuItem>
    {/each}
  </DropdownMenuGroup>
{/each}
<DropdownMenuSeparator />
<DropdownMenuItem onSelect={() => { commands.grid(target); onSelect(); }}>
  <span class="menu-item-row" title={m.editor_insert_menu_grid_title()}><Icon name="sidebar" /><span>{m.editor_insert_menu_grid()}</span></span>
</DropdownMenuItem>
{#if commands.offersSection()}
  <DropdownMenuItem onSelect={() => { commands.section(target); onSelect(); }}>
    <span class="menu-item-row" title={m.editor_insert_menu_page_section_title()}><Icon name="sidebar" /><span>{m.editor_insert_menu_page_section()}</span></span>
  </DropdownMenuItem>
{/if}
<DropdownMenuItem onSelect={() => { commands.flexLayout(target); onSelect(); }}>
  <span class="menu-item-row" title={m.editor_insert_menu_flex_row_title()}><Icon name="sidebar" /><span>{m.editor_insert_menu_flex_row()}</span></span>
</DropdownMenuItem>
{#if otherItems.length > 0}
  <DropdownMenuSeparator />
  <DropdownMenuGroup>
    <DropdownMenuGroupHeading>{m.editor_insert_menu_integrations()}</DropdownMenuGroupHeading>
    {#each otherItems as item (item.kind)}
      <DropdownMenuItem onSelect={() => { commands.block(target, item.node()); onSelect(); }}>
        <span class="menu-item-row" title={item.title?.()}><Icon name={item.icon} /><span>{item.label()}</span></span>
      </DropdownMenuItem>
    {/each}
  </DropdownMenuGroup>
{/if}

<style>
  .menu-item-row { display: flex; align-items: center; gap: 0.6rem; }
</style>
