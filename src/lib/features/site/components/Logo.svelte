<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import * as m from '$lib/paraglide/messages';

  // A size step, not a pixel prop: the reader's routes carry no style
  // attributes (platform/csp.ts), so the mark's height is a class rule.
  let { size = 'md' }: { size?: 'md' | 'lg' } = $props();

  const logoUrl = $derived($page.data.logoUrl as string | null | undefined);
  // With a dark logo both render and the scheme tokens show one, so the logo
  // follows the scheme of wherever it sits.
  const logoDarkUrl = $derived($page.data.logoDarkUrl as string | null | undefined);
  let imgError = $state(false);
  let darkError = $state(false);
  const dark = $derived(!!logoDarkUrl && !darkError);
</script>

<a class="logo logo-{size}" href="/" title={m.logo_home_aria()} aria-label={m.logo_home_aria()}>
  {#if dark}
    <img class="for-dark" src={logoDarkUrl} alt="" onerror={() => (darkError = true)} />
  {/if}
  {#if logoUrl && !imgError}
    <img class:for-light={dark} src={logoUrl} alt="" onerror={() => (imgError = true)} />
  {:else}
    <!-- Inline, so it takes --logo-size and currentColor. Both cuts are drawn and
         the mark's size shows one: the full mark at 32px and up, the small cut
         (no ear nodes, heavier strokes) below. -->
    <span class="mark" class:for-light={dark} aria-hidden="true">
      <svg class="mark-full" viewBox="0 0 64 64" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="3.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 11 L7.5 30 A24.5 24.5 0 0 0 56.5 30 L53 11 L32 22 Z" />
          <line x1="32" y1="23" x2="32" y2="42" stroke-width="3" />
        </g>
        <g fill="currentColor">
          <circle cx="11" cy="11" r="4.25" />
          <circle cx="53" cy="11" r="4.25" />
        </g>
        <g fill="currentColor">
          <circle cx="23.5" cy="30" r="4.75" />
          <circle cx="40.5" cy="30" r="4.75" />
        </g>
      </svg>
      <svg class="mark-small" viewBox="0 0 64 64" focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 11 L7.5 30 A24.5 24.5 0 0 0 56.5 30 L53 11 L32 22 Z" />
          <line x1="32" y1="23" x2="32" y2="42" stroke-width="3.5" />
        </g>
        <g fill="currentColor">
          <circle cx="23.5" cy="30" r="5.5" />
          <circle cx="40.5" cy="30" r="5.5" />
        </g>
      </svg>
    </span>
  {/if}
</a>

<style>
  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--logo-size);
    /* The link is a target: 44px on touch around the mark. */
    min-width: var(--ds-target-min);
    min-height: var(--ds-target-min);
    text-decoration: none;
    flex: none;
    /* The interface's text, not the link colour; a branded app bar re-points it. */
    color: var(--ds-color-fg);
  }
  .logo-md { --logo-size: 34px; }
  .logo-lg { --logo-size: 40px; }
  .logo img,
  .logo .mark {
    height: var(--logo-size);
    width: auto;
    display: block;
  }
  /* An explicit width, so it can't collapse in a flex row before the SVG's ratio
     resolves, and so its box is the container that picks the cut. */
  .logo .mark {
    width: var(--logo-size);
    container-type: inline-size;
  }
  .mark svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .mark .mark-full { display: none; }
  @container (min-width: 32px) {
    .mark .mark-full { display: block; }
    .mark .mark-small { display: none; }
  }
  .logo .for-light { display: var(--ds-logo-light-display); }
  .logo .for-dark { display: var(--ds-logo-dark-display); }
</style>
