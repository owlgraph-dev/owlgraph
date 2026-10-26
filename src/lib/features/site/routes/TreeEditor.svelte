<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The nav and footer tree's editor, one per consumer via `allowTopLevelLinks`.
  // Buttons posting real forms, no drag-and-drop, so it works without JavaScript.
  import { enhance } from '$app/forms';
  import { Button, EmptyState } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import TreeEntryModal from './TreeEntryModal.svelte';
  import { nodePath } from '$lib/features/nodes';
  import type { TreeNodeAdminRow, TreeNodeAdminWithChildren, TreeNodeKind } from '../types';

  let {
    nodes,
    allowTopLevelLinks,
    createAction,
    updateAction,
    deleteAction,
    moveAction,
    indentAction,
    outdentAction,
  }: {
    nodes: TreeNodeAdminWithChildren[];
    allowTopLevelLinks: boolean;
    createAction: string;
    updateAction: string;
    deleteAction: string;
    moveAction: string;
    indentAction: string;
    outdentAction: string;
  } = $props();

  type ModalState =
    | { mode: 'create'; kind: TreeNodeKind; parentId: string | null }
    | { mode: 'edit'; kind: TreeNodeKind; node: TreeNodeAdminRow };

  let modal = $state<ModalState | null>(null);

  // Mirrors indentTreeNode's rule: only into the group directly above.
  function canIndent(index: number): boolean {
    return index > 0 && nodes[index - 1]?.kind === 'group';
  }
</script>

{#if nodes.length === 0}
  <EmptyState>{m.settings_navigation_tree_empty()}</EmptyState>
{:else}
  <ul class="tree">
    {#each nodes as node, i (node.id)}
      <li class="node">
        <div class="row" class:group={node.kind === 'group'}>
          <span class="label">{node.label}</span>
          {#if node.kind === 'link'}
            <span class="target">
              {#if node.target_type === 'page'}
                {#if node.page_slug}<a href={nodePath(node.namespace_slug, node.page_slug)} target="_blank" rel="noopener">{node.page_title} · /{node.page_slug}</a>{:else}<em>{m.settings_navigation_tree_page_not_found()}</em>{/if}
              {:else}
                <a href={node.url} target="_blank" rel="noopener">{node.url}</a>
              {/if}
            </span>
          {/if}
          <span class="row-actions">
            <form method="POST" action={moveAction} use:enhance class="inline">
              <input type="hidden" name="id" value={node.id} />
              <input type="hidden" name="direction" value="up" />
              <Button type="submit" variant="ghost" size="sm" icon disabled={i === 0} aria-label={m.settings_navigation_tree_move_up()} title={m.settings_navigation_tree_move_up()}>↑</Button>
            </form>
            <form method="POST" action={moveAction} use:enhance class="inline">
              <input type="hidden" name="id" value={node.id} />
              <input type="hidden" name="direction" value="down" />
              <Button type="submit" variant="ghost" size="sm" icon disabled={i === nodes.length - 1} aria-label={m.settings_navigation_tree_move_down()} title={m.settings_navigation_tree_move_down()}>↓</Button>
            </form>
            {#if allowTopLevelLinks && node.kind === 'link'}
              <form method="POST" action={indentAction} use:enhance class="inline">
                <input type="hidden" name="id" value={node.id} />
                <Button type="submit" variant="ghost" size="sm" icon disabled={!canIndent(i)} aria-label={m.settings_navigation_tree_indent()} title={m.settings_navigation_tree_indent()}>⇥</Button>
              </form>
            {/if}
            <Button type="button" variant="ghost" size="sm" onclick={() => (modal = { mode: 'edit', kind: node.kind, node })}>{m.settings_navigation_tree_edit()}</Button>
            <form method="POST" action={deleteAction} use:enhance class="inline">
              <input type="hidden" name="id" value={node.id} />
              <Button type="submit" variant="ghost-danger" size="sm">{m.settings_navigation_tree_remove()}</Button>
            </form>
          </span>
        </div>

        {#if node.kind === 'group'}
          {#if node.children.length === 0}
            <div class="group-empty"><EmptyState size="sm">{m.settings_navigation_tree_group_empty()}</EmptyState></div>
          {:else}
            <ul class="children">
              {#each node.children as child, ci (child.id)}
                <li class="node child">
                  <div class="row">
                    <span class="label">{child.label}</span>
                    <span class="target">
                      {#if child.target_type === 'page'}
                        {#if child.page_slug}<a href={nodePath(child.namespace_slug, child.page_slug)} target="_blank" rel="noopener">{child.page_title} · /{child.page_slug}</a>{:else}<em>{m.settings_navigation_tree_page_not_found()}</em>{/if}
                      {:else}
                        <a href={child.url} target="_blank" rel="noopener">{child.url}</a>
                      {/if}
                    </span>
                    <span class="row-actions">
                      <form method="POST" action={moveAction} use:enhance class="inline">
                        <input type="hidden" name="id" value={child.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button type="submit" variant="ghost" size="sm" icon disabled={ci === 0} aria-label={m.settings_navigation_tree_move_up()} title={m.settings_navigation_tree_move_up()}>↑</Button>
                      </form>
                      <form method="POST" action={moveAction} use:enhance class="inline">
                        <input type="hidden" name="id" value={child.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button type="submit" variant="ghost" size="sm" icon disabled={ci === node.children.length - 1} aria-label={m.settings_navigation_tree_move_down()} title={m.settings_navigation_tree_move_down()}>↓</Button>
                      </form>
                      <form method="POST" action={outdentAction} use:enhance class="inline">
                        <input type="hidden" name="id" value={child.id} />
                        <Button type="submit" variant="ghost" size="sm" icon aria-label={m.settings_navigation_tree_outdent()} title={m.settings_navigation_tree_outdent()}>⇤</Button>
                      </form>
                      <Button type="button" variant="ghost" size="sm" onclick={() => (modal = { mode: 'edit', kind: child.kind, node: child })}>{m.settings_navigation_tree_edit()}</Button>
                      <form method="POST" action={deleteAction} use:enhance class="inline">
                        <input type="hidden" name="id" value={child.id} />
                        <Button type="submit" variant="ghost-danger" size="sm">{m.settings_navigation_tree_remove()}</Button>
                      </form>
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
          <span class="add-child"><Button variant="link" size="sm" onclick={() => (modal = { mode: 'create', kind: 'link', parentId: node.id })}>{m.settings_navigation_tree_add_link()}</Button></span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<div class="add-top-level">
  {#if allowTopLevelLinks}
    <Button size="sm" onclick={() => (modal = { mode: 'create', kind: 'link', parentId: null })}>{m.settings_navigation_tree_add_link()}</Button>
  {/if}
  <Button size="sm" onclick={() => (modal = { mode: 'create', kind: 'group', parentId: null })}>{m.settings_navigation_tree_add_group()}</Button>
</div>

{#if modal}
  <TreeEntryModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    kind={modal.kind}
    parentId={modal.mode === 'create' ? modal.parentId : null}
    node={modal.mode === 'edit' ? modal.node : null}
    {createAction}
    {updateAction}
    onSaved={() => (modal = null)}
  />
{/if}

<style>
  .tree, .children { list-style: none; margin: 0; padding: 0; }
  .tree { margin-bottom: 1rem; }
  .node { border-bottom: 1px solid var(--ds-color-border); }
  .node.child { border-bottom: 1px solid var(--ds-color-border); }
  .row { display: flex; align-items: center; gap: 1rem; padding: 0.4rem 0; }
  .row.group .label { font-weight: var(--ds-weight-semibold); color: var(--ds-color-muted); }
  .label { font-weight: var(--ds-weight-medium); flex: none; min-width: 10ch; }
  .target { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ds-color-muted); font-size: var(--ds-text-md); }
  .row-actions { display: flex; align-items: center; gap: 0.5rem; flex: none; }
  .row-actions > form { display: inline-flex; }
  .inline { display: inline; }
  .children { padding-left: 1.5rem; }
  .group-empty { padding-left: 1.5rem; margin: 0.2rem 0 0.5rem; }
  .add-child { display: block; margin: 0.4rem 0 0.8rem 1.5rem; }
  .add-top-level { display: flex; gap: 0.6rem; }
</style>
