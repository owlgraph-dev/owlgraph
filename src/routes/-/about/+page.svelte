<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import AboutPage from '$lib/shell/about/AboutPage.svelte';
  let { data } = $props();
</script>

<AboutPage {data} />
