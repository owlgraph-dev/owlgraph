<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Inline in a settings form: it takes no focus of its own, and Enter picks,
  // never submits the form. After a pick it starts over with an empty search.
  import * as m from '$lib/paraglide/messages';
  import NodePickerPanel from './NodePickerPanel.svelte';

  type PageResult = { id: string; slug: string; title: string };

  let { onselect, placeholder = m.page_picker_placeholder() }: { onselect: (page: PageResult) => void; placeholder?: string } =
    $props();

  let round = $state(0);
</script>

{#key round}
  <NodePickerPanel
    title={placeholder}
    {placeholder}
    types={['page']}
    rowAction={m.page_picker_choose()}
    recent={6}
    meta="address"
    size="sm"
    autofocus={false}
    hints={false}
    onPick={(node) => {
      onselect({ id: node.id, slug: node.slug, title: node.title });
      round++;
    }}
  />
{/key}
