<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts" generics="T extends EntryRow">
  // A listing of entries, drawn alike wherever something is listed
  // (docs/architecture/blocks/anatomy.md, "Shared listings"). It imports no stylesheet: the
  // content stylesheets carry entryList.css, and the public renderer's Node
  // loader can't load one.
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/design-system';
  import { glyphSvg } from '$lib/design-system/icons';
  import type { EntryPlaceholder, EntryRow } from './types';

  interface Props {
    /** What the listing is doing — ready, stale, loading, unavailable… — on its box, for its styles and its tests. */
    status: string;
    /** Where it is drawn: in the editor a row shows the pointer and its trailing slot is wider. */
    mode: 'editor' | 'page';
    density: 'normal' | 'compact';
    /** A trailing slot wide enough for an action's words, outside the editor too. */
    trail?: 'narrow' | 'wide';
    class?: string;
    /** Shown instead of the listing. */
    placeholder: EntryPlaceholder | null;
    /** The header's content: where in the listing it is, and its controls; none, no header. */
    head?: Snippet;
    /** The column header's words; a size or date not shown is still drawn, folded away by the box's class. */
    columns: { name: string; size?: { label: string; shown: boolean }; modified?: { label: string; shown: boolean }; kind?: string };
    /** Nothing to show yet: a skeleton in the rows' place. */
    loading: boolean;
    rows: T[];
    /** What an empty listing says. */
    empty: string;
    /** A row's trailing slot: its own links and actions. */
    trailing?: Snippet<[T]>;
    /** The footer's line. */
    footer: string;
    /** "Load more", when there is more to load. */
    more: { label: string; busy: boolean; load: () => void } | null;
    /** Where the whole of what is listed is — "All 37 entries", a link — when the listing shows a part of it. */
    moreLink?: { label: string; href: string; target?: string } | null;
    [attribute: string]: unknown;
  }

  let { status, mode, density, trail = 'narrow', class: className = '', placeholder, head, columns, loading, rows, empty, trailing, footer, more, moreLink = null, ...rest }: Props = $props();
</script>

{#snippet cells(row: T)}
  <span class="el-icon" aria-hidden="true">{@html glyphSvg(row.glyph, 18)}</span>
  <span class="el-name">
    <span class="el-name-text">{row.name}</span>
    {#if row.chip}<span class="el-chip">{@html glyphSvg(row.chip.glyph, 12)}{row.chip.label}</span>{/if}
    {#if row.note}<span class="el-note">{row.note}</span>{/if}
    <span class="el-meta">{row.meta}</span>
  </span>
  {#if columns.size}<span class="el-size">{row.size}</span>{/if}
  {#if columns.modified}<span class="el-modified">{row.modified}</span>{/if}
  {#if columns.kind}<span class="el-kind">{row.kind}</span>{/if}
{/snippet}

<div
  class="el el--{density} {columns.size?.shown === false ? 'el--no-size' : ''} {columns.modified?.shown === false ? 'el--no-modified' : ''} {trail === 'wide' ? 'el--trail-wide ' : ''}{className}"
  data-state={status}
  data-mode={mode}
  {...rest}
>
  {#if placeholder}
    <div class="el-placeholder{placeholder.editor ? ' el-placeholder--editor' : ''}" role={placeholder.status ? 'status' : undefined}>
      <span class="el-placeholder-icon{placeholder.tone === 'warning' ? ' el-placeholder-icon--warning' : ''}" aria-hidden="true">{@html glyphSvg(placeholder.glyph, 24)}</span>
      {#if placeholder.title}<p class="el-placeholder-title">{placeholder.title}</p>{/if}
      {#if placeholder.body}<p class="el-placeholder-body">{placeholder.body}</p>{/if}
      {#if placeholder.action}
        {@const action = placeholder.action}
        <Button size="sm" variant="secondary" href={action.href} target={action.target} rel={action.rel} data-sveltekit-reload={action.reload ? '' : undefined}>{action.label}</Button>
      {/if}
    </div>
  {:else}
    {#if head}<div class="el-head">{@render head()}</div>{/if}

    <div class="el-cols" aria-hidden="true">
      <span class="el-col-name">{columns.name}</span>
      {#if columns.size}<span class="el-size">{columns.size.label}</span>{/if}
      {#if columns.modified}<span class="el-modified">{columns.modified.label}</span>{/if}
      {#if columns.kind}<span class="el-kind">{columns.kind}</span>{/if}
    </div>

    {#if loading}
      <ul class="el-rows" aria-hidden="true">
        {#each [0, 1, 2] as i (i)}
          <li class="el-row el-row--skeleton"><span class="el-skeleton"></span></li>
        {/each}
      </ul>
    {:else if rows.length === 0}
      <p class="el-empty">{empty}</p>
    {:else}
      <ul class="el-rows">
        {#each rows as row (row.key)}
          <li class="el-row" class:el-row--folder={row.folder}>
            {#if row.target.kind === 'open'}
              <!-- ui-check-allow: raw-element — a row is the listing's own surface (the block's typography and surface style it); it opens its entry in place -->
              <button type="button" class="el-entry" onclick={row.target.open}>{@render cells(row)}</button>
            {:else if row.target.kind === 'link'}
              <a class="el-entry" href={row.target.href} target={row.target.target} rel={row.target.rel} download={row.target.download}>{@render cells(row)}</a>
            {:else}
              <div class="el-entry">{@render cells(row)}</div>
            {/if}
            <span class="el-trail">{#if trailing}{@render trailing(row)}{/if}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="el-foot">
      <span class="el-provenance">{footer}</span>
      {#if more}
        <Button size="sm" variant="secondary" loading={more.busy} onclick={more.load}>{more.label}</Button>
      {/if}
      {#if moreLink}
        <Button size="sm" variant="secondary" href={moreLink.href} target={moreLink.target}>{moreLink.label}</Button>
      {/if}
    </div>
  {/if}
</div>
