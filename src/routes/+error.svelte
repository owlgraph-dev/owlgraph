<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Every word here is the interface's: the server's error message is for
  // the log, so an unexpected error reads the same in every language.
  import { page } from '$app/stores';
  import * as m from '$lib/paraglide/messages';
</script>

<div class="error-page">
  <p class="code">{$page.status}</p>
  {#if $page.status === 404}
    <h1>{m.error_page_not_found_title()}</h1>
    <p class="msg">{m.error_page_not_found_body()}</p>
  {:else if $page.status === 403}
    <h1>{m.error_page_forbidden_title()}</h1>
    <p class="msg">{m.error_page_forbidden_body()}</p>
  {:else}
    <h1>{m.error_page_failed_title()}</h1>
    <p class="msg">{m.error_page_failed_body()}</p>
    <!-- The request's reqId, on every line it logged (docs/architecture/logging.md,
         "Correlation"); a 404 has nothing to look up. -->
    {#if $page.error?.id}
      <p class="error-id">{m.error_page_error_id()} <code>{$page.error.id}</code></p>
    {/if}
  {/if}
  <p class="actions"><a href="/">{m.error_page_home()}</a></p>
</div>

<style>
  .error-page {
    max-width: 30rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
    text-align: center;
  }
  .code {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1;
    color: var(--ds-color-muted);
    margin: 0;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0.4rem 0 0.6rem;
  }
  .msg {
    color: var(--ds-color-muted);
    line-height: 1.55;
  }
  .error-id {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: var(--ds-color-muted);
  }
  .error-id code {
    font-family: var(--ds-font-mono);
    user-select: all;
  }
  .actions {
    margin-top: 1.5rem;
  }
  .actions a {
    display: inline-flex;
    align-items: center;
    min-height: var(--ds-target-min);
    color: var(--ds-color-accent);
    text-decoration: none;
    font-weight: 500;
  }
  .actions a:hover {
    text-decoration: underline;
  }
</style>
