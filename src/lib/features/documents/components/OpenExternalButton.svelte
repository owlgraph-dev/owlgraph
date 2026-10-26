<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `href` is the content path, which redirects, so the button never carries
  // the address itself. Renders nothing when the stored address would fail the
  // redirect's own check, so it never leads to a 404.
  import { Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { safeExternalHref, externalHost } from '../externalUrl';

  let {
    href,
    externalUrl,
    variant = 'primary',
  }: { href: string; externalUrl: string | null; variant?: 'primary' | 'secondary' } = $props();

  const target = $derived(safeExternalHref(externalUrl));
</script>

{#if target}
  <Button {variant} {href} target="_blank" rel="noopener noreferrer" aria-label={m.document_open_aria({ host: externalHost(target) })}>
    {m.document_open()}
    <Icon name="external-link" size={16} />
  </Button>
{/if}
