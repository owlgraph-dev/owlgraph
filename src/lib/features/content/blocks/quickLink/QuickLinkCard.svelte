<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The quick-link card, in the editor and as the page's island. An authored
  // surface, never a chrome primitive: quickLink.css decides its look
  // (docs/architecture/blocks/anatomy.md, "Svelte leaf blocks").
  import { iconSvg, isIconName } from '$lib/design-system/icons';

  let {
    variant = 'link',
    href,
    external = false,
    label,
    icon = null,
    iconPosition = 'left',
    class: className = '',
    interactive = true,
    ...rest
  }: {
    variant?: string;
    href: string;
    /** Opens in a new tab: the page's rule for an off-site URL, the editor's for every card. */
    external?: boolean;
    label: string;
    /** A key of design-system/icons.ts, not Icon.svelte's registry. */
    icon?: string | null;
    iconPosition?: string;
    class?: string;
    /** false in the editor: the card is a block to select, never a link to follow. */
    interactive?: boolean;
    [key: string]: unknown;
  } = $props();

  const glyph = $derived(isIconName(icon) ? iconSvg(icon, iconPosition === 'top' ? 24 : 18) : '');

  // Set by an effect, so the server never renders it and hydration claims an
  // identical tree.
  let hydrated = $state(false);
  let showDest = $state(false);
  $effect(() => {
    hydrated = true;
  });
  const host = $derived.by(() => {
    if (!external || !interactive) return '';
    try {
      return new URL(href).host;
    } catch {
      return '';
    }
  });
  const show = () => (showDest = true);
  const hide = () => (showDest = false);
</script>

<a
  {href}
  class="quick-link quick-link--{variant} {className}"
  target={external ? '_blank' : undefined}
  rel={external ? 'noopener noreferrer' : undefined}
  tabindex={interactive ? undefined : -1}
  data-hydrated={hydrated || undefined}
  onfocus={show}
  onblur={hide}
  onpointerenter={show}
  onpointerleave={hide}
  {...rest}
>
  {#if glyph}<span class="quick-link-icon">{@html glyph}</span>{/if}
  <span class="quick-link-label">{label}</span>
  {#if showDest && host}<span class="quick-link-dest">{host}</span>{/if}
</a>
