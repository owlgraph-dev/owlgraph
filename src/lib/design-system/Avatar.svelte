<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Avatar as BitsAvatar } from 'bits-ui';

  let {
    src = null,
    alt = '',
    fallbackText = '',
    size = 'md',
    class: className = '',
  }: {
    /** Image URL, or null for the fallback without a request. Always passed to
     * Bits UI's Image: unmounting it leaves the Root's load status stuck. */
    src?: string | null;
    alt?: string;
    /** Name or email used to derive the single-letter fallback. */
    fallbackText?: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  } = $props();

  const initial = $derived(fallbackText.trim().charAt(0).toUpperCase());

  // Bits UI also passes the load state as a `style` prop; the reader's strict
  // style-src refuses style attributes (platform/csp.ts), so it is dropped and
  // the rules below read `data-status`.
  const withoutStyle = ({ style: _style, ...rest }: Record<string, unknown>) => rest;
</script>

<BitsAvatar.Root>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <span {...props} class="ds-avatar ds-avatar-{size} {className}">
      <BitsAvatar.Image src={src ?? undefined} {alt}>
        {#snippet child({ props }: { props: Record<string, unknown> })}
          <img {...withoutStyle(props)} class="ds-avatar-img" />
        {/snippet}
      </BitsAvatar.Image>
      <BitsAvatar.Fallback>
        {#snippet child({ props }: { props: Record<string, unknown> })}
          <span {...withoutStyle(props)} class="ds-avatar-fallback">{initial}</span>
        {/snippet}
      </BitsAvatar.Fallback>
    </span>
  {/snippet}
</BitsAvatar.Root>

<style>
  .ds-avatar {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    overflow: hidden;
    background: var(--ds-color-accent-soft);
    flex-shrink: 0;
  }
  .ds-avatar-sm { width: 26px; height: 26px; }
  .ds-avatar-md { width: 34px; height: 34px; }
  .ds-avatar-lg { width: 56px; height: 56px; }

  .ds-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ds-avatar-img:not([data-status='loaded']) { display: none; }
  .ds-avatar-fallback[data-status='loaded'] { display: none; }
  .ds-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--ds-color-accent);
    font-family: var(--ds-font-sans);
    font-weight: var(--ds-weight-medium);
    font-size: var(--ds-text-sm);
  }
  .ds-avatar-sm .ds-avatar-fallback { font-size: var(--ds-text-xs); }
  .ds-avatar-lg .ds-avatar-fallback { font-size: var(--ds-text-lg); }
</style>
