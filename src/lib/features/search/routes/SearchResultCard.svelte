<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The title and the excerpt are content, so they carry the node's language;
  // the rest is chrome, in the interface language.
  import * as m from '$lib/paraglide/messages';
  import { Badge, Card, Chip } from '$lib/design-system';
  import { parseSnippet, type DocumentKind, type SearchResultCard } from '$lib/features/search';
  import { formatDate } from '$lib/platform/i18n/format';

  let {
    result,
    clamp = false,
  }: {
    result: SearchResultCard;
    /** Cut the excerpt to four lines, so a grid row's cards come out alike. */
    clamp?: boolean;
  } = $props();

  const KIND_LABEL: Record<DocumentKind, () => string> = {
    pdf: m.search_doc_kind_pdf,
    text: m.search_doc_kind_text,
    markdown: m.search_doc_kind_markdown,
    link: m.search_doc_kind_link,
    file: m.search_doc_kind_file,
  };

  const parts = $derived(result.highlighted ? parseSnippet(result.excerpt) : [{ text: result.excerpt, hl: false }]);
</script>

<Card as="li" class="sr-card" data-testid="search-result">
  <h2 class="sr-title"><a href={result.url} lang={result.locale}>{result.title}</a></h2>
  {#if result.documentKind || result.className}
    <div class="sr-badges">
      {#if result.documentKind}
        <Badge tone="info">{KIND_LABEL[result.documentKind]()}{#if result.linkHost}&nbsp;· {result.linkHost}{/if}</Badge>
      {/if}
      {#if result.className}<Badge>{result.className}</Badge>{/if}
    </div>
  {/if}
  {#if result.excerpt}
    <p class="sr-excerpt" class:sr-excerpt-clamped={clamp} lang={result.locale}>{#each parts as part, i (i)}{#if part.hl}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</p>
  {/if}
  <div class="sr-foot">
    <p class="sr-meta">
      <time datetime={result.updatedAt}>{m.search_page_updated({ date: formatDate(result.updatedAt, { dateStyle: 'medium' }) })}</time>{#if result.namespaceName}<span aria-hidden="true">{' · '}</span><span>{result.namespaceName}</span>{/if}
    </p>
    {#if result.tags.length}
      <ul class="sr-tags" aria-label={m.search_page_card_tags()}>
        {#each result.tags as tag (tag)}<li><Chip label={tag} /></li>{/each}
      </ul>
    {/if}
  </div>
</Card>

<style>
  .sr-title { margin: 0; font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold); line-height: 1.3; }
  /* The card's one target: a whole line tall, and 44px on touch. */
  .sr-title a { display: flex; align-items: center; min-height: var(--ds-target-min); color: var(--ds-color-link); text-decoration: none; }
  .sr-title a:hover { text-decoration: underline; }
  .sr-badges { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); min-width: 0; }
  .sr-excerpt { margin: 0; font-size: var(--ds-text-sm); line-height: 1.5; color: var(--ds-color-fg); }
  /* The tint alone is faint on a card's surface; the weight carries it. */
  .sr-excerpt mark { background: var(--ds-color-accent-soft); color: inherit; font-weight: var(--ds-weight-semibold); border-radius: var(--ds-radius-sm); }
  .sr-excerpt-clamped {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
  }
  /* The auto margin takes the height a stretched grid row adds, so a row's
     dates and tags line up at the bottom. */
  .sr-foot { display: flex; flex-direction: column; gap: var(--ds-space-sm); margin-top: auto; }
  .sr-meta { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .sr-tags { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); margin: 0; padding: 0; list-style: none; }
</style>
