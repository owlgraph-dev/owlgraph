<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The Mermaid render frame (content/blocks/diagram/mermaidFrame.ts), which
  // the reader's pages hand their diagrams to. Its own policy allows the inline
  // styles Mermaid needs, and only this origin may embed it (platform/cspRoutes.ts).
  import { onMount } from 'svelte';
  import { serveMermaidFrame } from '$lib/features/content';

  onMount(() => serveMermaidFrame());
</script>
