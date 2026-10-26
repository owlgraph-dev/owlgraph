<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // In the current text colour. Decorative by default, since the busy thing says
  // so (aria-busy, a live line); `label` makes it a status when it is the only sign.
  let {
    size = 16,
    label,
    class: className = '',
  }: {
    /** Pixel size of the glyph, like Icon's. */
    size?: number;
    /** Makes it a status with this accessible name ("Uploading"). */
    label?: string;
    class?: string;
  } = $props();
</script>

<span
  class="ds-spinner {className}"
  role={label ? 'status' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
    <circle class="ds-spinner-track" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
    <path class="ds-spinner-arc" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
  </svg>
</span>

<style>
  .ds-spinner { display: inline-flex; flex: none; }
  .ds-spinner svg { display: block; animation: ds-spin 0.8s linear infinite; }
  .ds-spinner-track { opacity: 0.25; }
  @keyframes ds-spin { to { transform: rotate(360deg); } }
  @keyframes ds-spinner-pulse { 50% { opacity: 0.35; } }
  /* The one reduced-motion rule in a primitive (docs/architecture/design-system/primitives.md,
     "Spinner"): the global rule would freeze the arc, so an opacity pulse
     stands in, restated past it. */
  @media (prefers-reduced-motion: reduce) {
    .ds-spinner svg { animation: none; }
    .ds-spinner-arc {
      animation: ds-spinner-pulse 1.6s ease-in-out infinite !important;
      animation-duration: 1.6s !important;
      animation-iteration-count: infinite !important;
    }
  }
</style>
