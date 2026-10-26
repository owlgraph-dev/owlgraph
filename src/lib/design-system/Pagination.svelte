<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Every page is a plain link the consumer builds with `href`; previous and
  // next are left out at the ends, since a disabled link still navigates. Both
  // rows render and the container's width shows one; the other is display: none.
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { pageWindow, type PageWindowItem } from './pagination';

  let {
    page,
    pageCount,
    href,
    ariaLabel,
    previousLabel,
    nextLabel,
    pageLabel,
    class: className = '',
  }: {
    /** The current page, 1-based. */
    page: number;
    pageCount: number;
    /** The URL of a page. */
    href: (page: number) => string;
    /** The navigation's accessible name ("Pages of results"). */
    ariaLabel: string;
    previousLabel: string;
    nextLabel: string;
    /** A page number's accessible name ("Page 4"). */
    pageLabel: (page: number) => string;
    class?: string;
  } = $props();

  const wide = $derived(pageWindow(page, pageCount, 1));
  const narrow = $derived(pageWindow(page, pageCount, 0));
</script>

{#snippet row(items: PageWindowItem[], kind: 'wide' | 'narrow')}
  <ul class="ds-pagination-row ds-pagination-{kind}">
    {#if page > 1}
      <li>
        <Button variant="ghost" href={href(page - 1)} rel="prev" aria-label={previousLabel} title={kind === 'narrow' ? previousLabel : undefined}>
          <Icon name="chevron-left" size={16} />{#if kind === 'wide'}<span>{previousLabel}</span>{/if}
        </Button>
      </li>
    {/if}
    {#each items as item, i (`${kind}-${item}-${i}`)}
      <li>
        {#if item === 'gap'}
          <span class="ds-pagination-gap" aria-hidden="true">…</span>
        {:else if item === page}
          <span class="ds-pagination-current" aria-current="page">{item}</span>
        {:else}
          <Button variant="ghost" href={href(item)} aria-label={pageLabel(item)}>{item}</Button>
        {/if}
      </li>
    {/each}
    {#if page < pageCount}
      <li>
        <Button variant="ghost" href={href(page + 1)} rel="next" aria-label={nextLabel} title={kind === 'narrow' ? nextLabel : undefined}>
          {#if kind === 'wide'}<span>{nextLabel}</span>{/if}<Icon name="chevron-right" size={16} />
        </Button>
      </li>
    {/if}
  </ul>
{/snippet}

{#if pageCount > 1}
  <nav class="ds-pagination {className}" aria-label={ariaLabel}>
    {@render row(wide, 'wide')}
    {@render row(narrow, 'narrow')}
  </nav>
{/if}

<style>
  .ds-pagination { container-type: inline-size; width: 100%; font-family: var(--ds-font-sans); }
  .ds-pagination-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--ds-space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ds-pagination-narrow { display: none; gap: 0; }
  @container (max-width: 32rem) {
    .ds-pagination-wide { display: none; }
    .ds-pagination-narrow { display: flex; }
  }
  /* The same box as a page link (a md ghost Button). */
  .ds-pagination-current,
  .ds-pagination-gap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    height: var(--ds-control-h-md);
    min-width: var(--ds-target-min);
    padding: 0 0.7rem;
    border-radius: var(--ds-radius-sm);
    font-size: var(--ds-text-md);
  }
  .ds-pagination-current { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); font-weight: var(--ds-weight-semibold); }
  .ds-pagination-gap { color: var(--ds-color-muted); padding: 0; }
</style>
