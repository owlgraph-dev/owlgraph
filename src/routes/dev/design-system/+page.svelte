<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The route reads `?section=<id>` and `?scheme=dark` for the playground,
  // which like the rest of the design system imports nothing from $app/*.
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Playground from '$lib/design-system/playground/Playground.svelte';

  const section = $derived($page.url.searchParams.get('section'));
  const scheme = $derived($page.url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light');

  function setScheme(next: 'light' | 'dark') {
    const url = new URL($page.url);
    if (next === 'dark') url.searchParams.set('scheme', 'dark');
    else url.searchParams.delete('scheme');
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head>
  <title>Design system · owlgraph</title>
</svelte:head>

<Playground {section} {scheme} onSchemeChange={setScheme} />
