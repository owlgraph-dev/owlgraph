<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The image block, for the NodeView and the page. No grip in fill mode,
  // whose width is the frame's. An <img> loads the moment it has a `src`,
  // attached or not, so `loading` and the copies come before it below.
  import ImageResizeHandle from './ImageResizeHandle.svelte';
  import type { ImageEditing } from './view';

  let {
    src = '',
    srcset = null,
    sizes = null,
    alt = '',
    ruleId = '',
    align = null,
    box = null,
    position = null,
    backdrop = null,
    lead = false,
    editing = null,
  }: {
    src?: string;
    /** Null when there are no copies to choose from (imageSources.ts). */
    srcset?: string | null;
    sizes?: string | null;
    alt?: string;
    /** The image's rule in the surface's stylesheet, '' for none. */
    ruleId?: string;
    /** The alignment of an image never placed. */
    align?: string | null;
    box?: string | null;
    position?: string | null;
    /** The scheme of a backdrop behind a transparent image. */
    backdrop?: string | null;
    /** The page's opening image: loaded at once and first. */
    lead?: boolean;
    editing?: ImageEditing | null;
  } = $props();

  let img: HTMLImageElement | undefined = $state();
</script>

<!-- Nothing between the image and the grip: the editor's pre-wrap would draw a space as a line. -->
<img
  class="page-image"
  loading={lead ? undefined : 'lazy'}
  fetchpriority={lead ? 'high' : undefined}
  decoding="async"
  srcset={srcset ?? undefined}
  sizes={sizes ?? undefined}
  {src}
  {alt}
  data-b={ruleId || undefined}
  data-align={align ?? undefined}
  data-box={box ?? undefined}
  data-pos={position ?? undefined}
  data-backdrop={backdrop ? '' : undefined}
  data-scheme={backdrop ?? undefined}
  bind:this={img}
/>{#if editing && img && box !== 'fill'}<ImageResizeHandle {editing} {img} {ruleId} />{/if}
