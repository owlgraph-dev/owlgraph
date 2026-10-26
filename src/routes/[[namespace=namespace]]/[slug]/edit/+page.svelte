<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import EditPage from '$lib/features/editor/routes/EditPage.svelte';
  let { data } = $props();
</script>

<EditPage {data} />
