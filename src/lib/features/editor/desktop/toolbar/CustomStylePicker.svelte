<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The named-style picker. Label and class, no styled preview: the compiled
  // rules are scoped to the page canvas (docs/architecture/custom-styles.md) and this
  // popover portals to the body.
  import { Button, Popover, TriggerFace } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { preserveEditorFocusOnClose } from '../keyboard';
  import type { EditorCore } from '../../core/editorCore.svelte';
  import type { EditorOverlays } from '../overlays.svelte';

  let {
    core,
    overlays,
    toolbarProps,
  }: {
    core: EditorCore;
    overlays: EditorOverlays;
    /** The toolbar button's props: the trigger is one of the toolbar's stops. */
    toolbarProps: Record<string, unknown>;
  } = $props();

  /** The inline named styles this site offers. */
  const customStyles = $derived(core.format.customStyleOptions());
  const showSheetNames = $derived(new Set(customStyles.map((style) => style.stylesheet)).size > 1);

  function pick(styleId: string | null) {
    core.format.setCustomStyle(styleId);
    overlays.popover = null;
  }
</script>

<Popover
  open={overlays.popover === 'customStyle'}
  onOpenChange={(o) => (overlays.popover = o ? 'customStyle' : null)}
  disabled={core.format.isNodeSelection && !core.format.blockScope}
  side="bottom"
  align="start"
  class="typo-pop"
  onCloseAutoFocus={preserveEditorFocusOnClose}
  triggerProps={{ ...toolbarProps, title: m.editor_custom_style_label(), 'aria-label': m.editor_custom_style_label() }}
>
  {#snippet trigger()}
    <TriggerFace variant="toolbar" icon active={!!core.format.customStyleId}><Icon name="sliders" size={15} /></TriggerFace>
  {/snippet}
  {#if customStyles.length === 0}
    <p class="cs-empty">{m.editor_custom_style_empty()}</p>
  {:else}
    {@const styleId = core.format.customStyleId}
    {@const mixed = core.format.customStyleMixed}
    <div class="cs-list" role="group" aria-label={m.editor_custom_style_label()}>
      {#if mixed}<p class="cs-mixed">{m.editor_custom_style_mixed()}</p>{/if}
      <Button
        variant="ghost"
        size="sm"
        class="cs-item"
        active={!mixed && styleId === null}
        aria-pressed={!mixed && styleId === null}
        onclick={() => pick(null)}
      >{m.editor_custom_style_none()}</Button>
      {#each customStyles as style (style.id)}
        {@const first = customStyles.findIndex((s) => s.stylesheet === style.stylesheet) === customStyles.indexOf(style)}
        {#if first && showSheetNames}<p class="cs-sheet">{style.stylesheet}</p>{/if}
        <Button
          variant="ghost"
          size="sm"
          class="cs-item"
          active={styleId === style.id}
          aria-pressed={styleId === style.id}
          onclick={() => pick(style.id)}
        ><span class="cs-label">{style.label}</span><span class="cs-class">{style.className}</span></Button>
      {/each}
    </div>
  {/if}
</Popover>

<style>
  .cs-list { display: grid; gap: 0.15rem; min-width: 12rem; }
  .cs-list :global(.cs-item) { justify-content: space-between; gap: var(--ds-space-md); width: 100%; }
  .cs-class { font-family: var(--ds-font-mono); font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .cs-sheet {
    margin: 0.35rem 0 0.1rem;
    font-size: var(--ds-text-xs);
    color: var(--ds-color-muted);
  }
  .cs-mixed,
  .cs-empty {
    margin: 0;
    padding: 0.15rem 0.1rem;
    max-width: 16rem;
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
</style>
