<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One typography control of the toolbar: its trigger and the fields it edits,
  // the selected block's own values or the marks on the selected text, as the
  // core's arbitration decides (core/format.svelte.ts).
  import type { Snippet } from 'svelte';
  import { Popover } from '$lib/design-system';
  import { resolveParagraphStyle, getTypographyRegistry } from '$lib/features/content';
  import TypographyField from '../../capabilities/typography/TypographyField.svelte';
  import TypographyMarkFields from '../../capabilities/typography/TypographyMarkFields.svelte';
  import type { EditorCore } from '../../core/editorCore.svelte';
  import type { TypographyFieldName } from '../../core/format.svelte';
  import type { EditorOverlays, ToolbarPopover } from '../overlays.svelte';

  let {
    core,
    overlays,
    name,
    label,
    fields,
    colorWarning = null,
    toolbarProps,
    trigger,
  }: {
    core: EditorCore;
    overlays: EditorOverlays;
    /** Which of the toolbar's popovers this is: one is open at a time. */
    name: ToolbarPopover;
    label: string;
    fields: TypographyFieldName[];
    /** Whether the typography colour reads on its background. */
    colorWarning?: string | null;
    /** The toolbar button's props: the trigger is one of the toolbar's stops. */
    toolbarProps: Record<string, unknown>;
    trigger: Snippet;
  } = $props();
</script>

<Popover
  open={overlays.popover === name}
  onOpenChange={(o) => (overlays.popover = o ? name : null)}
  disabled={core.format.isNodeSelection && !core.format.blockScope}
  side="bottom"
  align="start"
  class="typo-pop"
  triggerProps={{ ...toolbarProps, title: label, 'aria-label': label }}
  {trigger}
>
  {#if core.format.blockScope && core.selection.textTarget}
    {@const target = core.selection.textTarget}
    {@const defaults = resolveParagraphStyle(target.type, target.attrs, getTypographyRegistry().paragraphStyles).defaults}
    <TypographyField value={target.attrs.typography} {defaults} {fields} {colorWarning} innerColors={core.format.inlineColors} onChange={core.format.setField} />
  {:else}
    <TypographyMarkFields value={core.format.markValue} mixed={core.format.markMixed} {fields} {colorWarning} onChange={core.format.setField} />
  {/if}
</Popover>
