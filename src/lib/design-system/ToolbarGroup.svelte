<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `value` is one-way: Bits' own toggling must never become the source of
  // truth, so the caller's state (Tiptap's active marks) wins on the next render
  // (docs/architecture/design-system/patterns.md, "Composing Toolbar with overlay triggers").
  import { Toolbar as BitsToolbar } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    type,
    value,
    onValueChange,
    disabled = false,
    class: className = '',
    children,
    ...rest
  }: {
    type: 'single' | 'multiple';
    value: string | string[];
    onValueChange?: (value: string | string[]) => void;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<BitsToolbar.Group {type} {value} {onValueChange} {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-toolbar-group {className}" {...rest}>
      {@render children?.()}
    </div>
  {/snippet}
</BitsToolbar.Group>

<style>
  .ds-toolbar-group {
    display: flex;
    align-items: center;
  }
</style>
