<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One document as a row or a card, drawn alike by whichever block shows one
  // (docs/architecture/blocks/anatomy.md, "Shared listings"). It imports no stylesheet: the
  // content stylesheets carry documentEntry.css, and the public renderer's
  // Node loader can't load one.
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { glyphSvg } from '$lib/design-system/icons';
  import type { DocumentEntryFile, DocumentPlaceholder } from './types';

  interface Props {
    /** What the entry is doing — ready, loading, unavailable… — on its box, for its styles and its tests. */
    status: string;
    mode: 'editor' | 'page';
    variant: 'row' | 'card';
    class?: string;
    /** Nothing to show yet: a skeleton in the file's place. */
    loading: boolean;
    /** Shown instead of the file. */
    placeholder: DocumentPlaceholder | null;
    /** The placeholder's further actions — an editor's repairs. */
    placeholderActions?: Snippet;
    /** The file, when it is shown. */
    file: DocumentEntryFile | null;
    [attribute: string]: unknown;
  }

  let { status, mode, variant, class: className = '', loading, placeholder, placeholderActions, file, ...rest }: Props = $props();
</script>

{#snippet inner(f: DocumentEntryFile, card: boolean)}
  {#if !card}
    <span class="de-icon" aria-hidden="true">{@html glyphSvg(f.glyph, 20)}</span>
  {:else if f.preview}
    <span class="de-preview" aria-hidden="true">
      {#if 'image' in f.preview}
        <img class="de-image" src={f.preview.image} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="de-tile">{@html glyphSvg(f.glyph, 40)}<span class="de-tile-type">{f.preview.tile}</span></span>
      {/if}
    </span>
  {/if}
  <span class="de-text">
    <span class="de-title">
      <span class="de-title-text">{f.title}</span>
      {#if f.chip}<span class="de-chip">{@html glyphSvg('link', 12)}{f.chip}</span>{/if}
    </span>
    {#if f.facts || f.location}
      <span class="de-meta">
        {#if f.facts}<span>{f.facts}</span>{/if}
        {#if f.facts && f.location}<span aria-hidden="true">·</span>{/if}
        {#if f.location}<span class="de-location">{@html glyphSvg(f.location.glyph, 14)}<span>{f.location.text}</span></span>{/if}
      </span>
    {/if}
  </span>
{/snippet}

<!-- `download` on a file a browser can't show also keeps the app's router from taking the link for a page. -->
{#snippet entry(f: DocumentEntryFile, card: boolean)}
  {#if f.link}
    <a class="de-entry" href={f.link.href} target={f.link.target} rel={f.link.rel} download={f.link.download}>{@render inner(f, card)}</a>
  {:else}
    <div class="de-entry">{@render inner(f, card)}</div>
  {/if}
{/snippet}

{#snippet actions(f: DocumentEntryFile, compact: boolean)}
  {#if f.nodeLink || f.download}
    <div class="de-actions">
      {#if f.nodeLink}
        <Button size="sm" variant="ghost" href={f.nodeLink.href} target={f.linkTarget}>{f.nodeLink.label}</Button>
      {/if}
      {#if f.download}
        <span class="de-download-wide">
          <Button size="sm" variant="secondary" href={f.download.href} download={f.download.filename} target={f.linkTarget}><Icon name="download" size={14} />{f.download.label}</Button>
        </span>
        {#if compact}
          <span class="de-download-compact">
            <Button size="sm" variant="ghost" icon href={f.download.href} download={f.download.filename} target={f.linkTarget} aria-label={f.download.label} title={f.download.label}>
              <Icon name="download" size={16} />
            </Button>
          </span>
        {/if}
      {/if}
    </div>
  {/if}
{/snippet}

<div class="de de--{variant} {className}" data-state={status} data-mode={mode} {...rest}>
  {#if loading}
    <div class="de-row de-row--skeleton" aria-hidden="true">
      <span class="de-skeleton de-skeleton--icon"></span>
      <span class="de-skeleton de-skeleton--line"></span>
    </div>
  {:else if placeholder}
    <div class="de-placeholder{placeholder.editor ? ' de-placeholder--editor' : ''}" role={placeholder.status ? 'status' : undefined}>
      <span class="de-placeholder-icon{placeholder.tone === 'warning' ? ' de-placeholder-icon--warning' : ''}" aria-hidden="true">{@html glyphSvg(placeholder.glyph, 24)}</span>
      {#if placeholder.title !== undefined}<p class="de-placeholder-title">{placeholder.title}</p>{/if}
      {#if placeholder.name !== undefined}<p class="de-placeholder-name">{placeholder.name}</p>{/if}
      {#if placeholder.body !== undefined}<p class="de-placeholder-body">{placeholder.body}</p>{/if}
      {#if placeholder.action || placeholderActions}
        <div class="de-placeholder-actions">
          {#if placeholder.action}
            {@const action = placeholder.action}
            <Button size="sm" variant="secondary" href={action.href} target={action.target} data-sveltekit-reload={action.reload ? '' : undefined}>{action.label}</Button>
          {/if}
          {#if placeholderActions}{@render placeholderActions()}{/if}
        </div>
      {/if}
    </div>
  {:else if file && variant === 'card'}
    {@render entry(file, true)}
    {@render actions(file, false)}
  {:else if file}
    <div class="de-row">
      {@render entry(file, false)}
      {@render actions(file, true)}
    </div>
  {/if}
</div>
