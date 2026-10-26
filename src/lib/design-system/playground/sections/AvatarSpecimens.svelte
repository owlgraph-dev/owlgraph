<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Avatar from '../../Avatar.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const sizes = ['sm', 'md', 'lg'] as const;

  // A tiny inline SVG so the image path renders without a network request.
  const sampleSrc =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2f6f8f"/><circle cx="32" cy="24" r="12" fill="#f3f0e8"/><path d="M8 62a24 24 0 0 1 48 0z" fill="#f3f0e8"/></svg>',
    );
</script>

<SpecimenGrid title="Sizes — fallback initial (src=null)">
  {#each sizes as size (size)}
    <Specimen label="size={size}, fallbackText" state="fallback-{size}">
      <Avatar {size} src={null} fallbackText="Alex Example" alt="Alex Example" />
      <Avatar {size} src={null} fallbackText="alex@example.org" alt="alex@example.org" />
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Sizes — image (src set)">
  {#each sizes as size (size)}
    <Specimen label="size={size}, src + alt" state="image-{size}">
      <Avatar {size} src={sampleSrc} fallbackText="Alex Example" alt="Alex Example" />
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="empty fallbackText (blank disc)" state="no-fallback">
    <Avatar src={null} fallbackText="" alt="" />
  </Specimen>
  <Specimen label="broken src falls back to the initial" state="broken-src">
    <Avatar src="data:image/png;base64,AAAA" fallbackText="Alex Example" alt="Alex Example" />
  </Specimen>
  <Specimen label="next to a name" state="inline-name">
    <span class="row"><Avatar size="sm" src={null} fallbackText="Alex Example" alt="" /> Alex Example</span>
  </Specimen>
</SpecimenGrid>

<style>
  .row { display: inline-flex; align-items: center; gap: var(--ds-space-sm); font-family: var(--ds-font-sans); color: var(--ds-color-fg); }
</style>
