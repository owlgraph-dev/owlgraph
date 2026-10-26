<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // "/" without a home page the viewer can read (home.server.ts).
  import { Button, EmptyState } from '$lib/design-system';
  import { nodePath } from '$lib/features/nodes';
  import { createDialog } from '$lib/shell/appbar/createDialog.svelte';
  import * as m from '$lib/paraglide/messages';
  let { data } = $props();
</script>

{#if data.welcome}
  <section class="welcome">
    <h1>{m.home_welcome_title()}</h1>
    <p class="sub">{m.home_welcome_intro()}</p>
    <div class="actions"><Button href="/login" variant="primary">{m.home_welcome_sign_in()}</Button></div>
  </section>
{:else if data.canCreate || data.canSetHome}
  <header class="hero">
    <h1>{m.home_no_home_title()}</h1>
    <p class="sub">{data.canSetHome ? m.home_no_home_intro_admin() : m.home_no_home_intro_editor()}</p>
    <div class="actions">
      {#if data.canCreate}
        <Button variant="primary" onclick={() => (createDialog.open = true)}>{m.home_create_page()}</Button>
      {/if}
      {#if data.canSetHome}
        <!-- Settings run under a looser style policy than "/": a full navigation. -->
        <Button href="/settings/home" data-sveltekit-reload>{m.home_set_home()}</Button>
      {/if}
    </div>
  </header>
  <h2 class="list-heading">{m.home_pages_heading()}</h2>
  {#if data.pages.length === 0}
    <EmptyState>{m.home_pages_empty()}</EmptyState>
  {:else}
    {@render pageList(data.pages)}
  {/if}
{:else}
  <header class="hero">
    <h1>{m.home_index_title()}</h1>
    <p class="sub">{m.home_index_intro()}</p>
  </header>
  {#if data.pages.length === 0}
    <EmptyState>{m.home_index_empty()}</EmptyState>
  {:else}
    {@render pageList(data.pages)}
  {/if}
{/if}

{#snippet pageList(pages: { id: string; title: string; slug: string; namespace_slug: string | null }[])}
  <ul class="index">
    {#each pages as page (page.id)}
      <li><a href={nodePath(page.namespace_slug, page.slug)}>{page.title}</a></li>
    {/each}
  </ul>
{/snippet}

<style>
  .welcome {
    max-width: 32rem;
    margin: var(--ds-space-lg) auto 0;
    text-align: center;
  }
  .welcome .actions { justify-content: center; }
  .hero { margin-bottom: var(--ds-space-lg); }
  h1 { margin: 0; }
  .sub { color: var(--ds-color-muted); margin: var(--ds-space-sm) 0 0; }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ds-space-sm);
    margin-top: var(--ds-space-md);
  }
  .list-heading { font-size: var(--ds-text-lg); margin: 0 0 var(--ds-space-sm); }
  .index { list-style: none; padding: 0; margin: 0; }
  .index li { border-bottom: 1px solid var(--ds-color-border); }
  /* The whole row, a 44px target. */
  .index a { display: block; padding: 0.7rem 0; font-weight: 500; font-size: 1.05rem; text-decoration: none; color: var(--ds-color-link); }
  .index a:hover { text-decoration: underline; }
</style>
