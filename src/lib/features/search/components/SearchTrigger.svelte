<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { searchOverlayOpen } from '../searchOverlayStore';
  import * as m from '$lib/paraglide/messages';
</script>

<!-- One per bar, the phone's lg for touch. CSS picks the one that shows, so the
     size is right before hydration. -->
<span class="desktop-only">
  <Button variant="ghost" icon active={$searchOverlayOpen} onclick={() => searchOverlayOpen.set(true)} title={m.search_trigger_aria()} aria-label={m.search_trigger_aria()}><Icon name="search" /></Button>
</span>
<span class="phone-only">
  <Button variant="ghost" size="lg" icon active={$searchOverlayOpen} onclick={() => searchOverlayOpen.set(true)} title={m.search_trigger_aria()} aria-label={m.search_trigger_aria()}><Icon name="search" /></Button>
</span>

<style>
  .desktop-only { display: inline-flex; }
  .phone-only { display: none; }
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .desktop-only { display: none; }
    .phone-only { display: inline-flex; }
  }
</style>
