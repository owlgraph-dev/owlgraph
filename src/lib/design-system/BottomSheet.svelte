<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A bottom sheet on BitsDialog.Content (bits-ui has no sheet); the handle is
  // visual only. A part may show a page in it (sheetPage.ts): the page takes
  // the title and body, Escape steps back, and the content stays mounted beneath.
  import { Dialog as BitsDialog } from 'bits-ui';
  import { tick, untrack, type Snippet } from 'svelte';
  import { lockBodyScroll } from './scrollLock';
  import { setSheetPageOutlet, type SheetPage } from './sheetPage';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  let {
    open = $bindable(false),
    onOpenChange,
    title,
    size = 'md',
    body = 'scroll',
    closeLabel,
    class: className = '',
    children,
    actions,
    footer,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    title: string;
    /** `lg` rises to all but a strip of backdrop (`--ds-sheet-gap`), for a long panel. */
    size?: 'md' | 'lg';
    /** As Dialog's: `fill` makes the body a box its one child fills. */
    body?: 'scroll' | 'fill';
    /** Adds a header close button with this (translated) label. */
    closeLabel?: string;
    class?: string;
    children?: Snippet;
    /** A short state beside the title (a filter count), outside the dialog's name. */
    actions?: Snippet;
    /** Actions below the scrolling body, always in view, as Dialog's footer. */
    footer?: Snippet;
  } = $props();

  // The app's own scroll lock (scrollLock.ts), as in Dialog.svelte.
  $effect(() => {
    if (open) return lockBodyScroll();
  });

  // Last on top, each with the element that had focus when it opened.
  type Shown = { page: SheetPage; from: HTMLElement | null };
  let pages = $state.raw<Shown[]>([]);
  const top = $derived(pages.at(-1)?.page ?? null);
  // Called from a part's effect: the list is read untracked, or that effect
  // would depend on the pages it changes.
  setSheetPageOutlet({
    show(page) {
      const shown: Shown = { page, from: document.activeElement instanceof HTMLElement ? document.activeElement : null };
      pages = [...untrack(() => pages), shown];
      return () => {
        const now = untrack(() => pages);
        if (!now.includes(shown)) return;
        pages = now.filter((p) => p !== shown);
        void tick().then(() => {
          if (shown.from?.isConnected) shown.from.focus();
        });
      };
    },
  });

  // An opened page takes the focus, since what had it is hidden now.
  let pageEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!top || !pageEl) return;
    const el = pageEl;
    void tick().then(() => {
      if (el.contains(document.activeElement)) return;
      el.querySelector<HTMLElement>('input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])')?.focus();
    });
  });

  function onEscapeKeydown(e: KeyboardEvent) {
    if (!top) return;
    e.preventDefault();
    top.onBack();
  }
</script>

{#snippet titleEl()}
  <BitsDialog.Title>
    {#snippet child({ props: titleProps }: { props: Record<string, unknown> })}
      <div {...titleProps} class="ds-sheet-title">{top?.title ?? title}</div>
    {/snippet}
  </BitsDialog.Title>
{/snippet}

<!-- Every Bits UI part renders through its `child` snippet, so the styles are scoped. -->
<BitsDialog.Root bind:open {onOpenChange}>
  <BitsDialog.Portal>
    <BitsDialog.Overlay>
      {#snippet child({ props }: { props: Record<string, unknown> })}
        <div {...props} class="ds-sheet-overlay"></div>
      {/snippet}
    </BitsDialog.Overlay>
    <BitsDialog.Content preventScroll={false} {onEscapeKeydown}>
      {#snippet child({ props }: { props: Record<string, unknown> })}
        <div {...props} class="ds-sheet-content ds-sheet-{size} {className}">
          <div class="ds-sheet-handle" aria-hidden="true"></div>
          {#if actions || closeLabel || top}
            <!-- Outside the scrolling body: the close button never scrolls away. -->
            <div class="ds-sheet-header">
              {#if top}
                <Button variant="ghost" size="sm" icon aria-label={top.backLabel} title={top.backLabel} onclick={top.onBack}><Icon name="chevron-left" size={16} /></Button>
              {/if}
              {@render titleEl()}
              {#if actions && !top}<div class="ds-sheet-actions">{@render actions()}</div>{/if}
              {#if closeLabel}
                <BitsDialog.Close>
                  {#snippet child({ props: closeProps }: { props: Record<string, unknown> })}
                    <Button {...closeProps} variant="ghost" size="sm" icon aria-label={closeLabel} title={closeLabel}><Icon name="x" size={16} /></Button>
                  {/snippet}
                </BitsDialog.Close>
              {/if}
            </div>
          {:else}
            {@render titleEl()}
          {/if}
          <div class="ds-sheet-body" class:ds-sheet-body-fill={top ? top.fill : body === 'fill'}>
            <div class="ds-sheet-main" hidden={!!top}>{@render children?.()}</div>
            {#if top}<div class="ds-sheet-page" bind:this={pageEl}>{@render top.body()}</div>{/if}
          </div>
          {#if footer && !top}
            <div class="ds-sheet-footer">{@render footer()}</div>
          {/if}
        </div>
      {/snippet}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
  .ds-sheet-overlay {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 100vw;
    background: var(--ds-color-scrim);
    z-index: var(--ds-z-scrim);
  }
  .ds-sheet-overlay[data-state='open'] { animation: ds-sheet-fade 0.15s ease; }

  /* Not overflow: auto: a native scrollbar ignores the border-radius and would
     cross the rounded corners, so the body scrolls instead. */
  .ds-sheet-content {
    position: fixed;
    z-index: var(--ds-z-modal);
    left: 0;
    right: 0;
    /* On the on-screen keyboard, not under it (--ds-keyboard-inset). */
    bottom: var(--ds-keyboard-inset, 0px);
    max-height: calc(80vh - var(--ds-keyboard-inset, 0px));
    max-height: calc(80dvh - var(--ds-keyboard-inset, 0px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--ds-color-raised-modal);
    border: 1px solid var(--ds-color-border-elevated);
    border-bottom: none;
    border-top-left-radius: var(--ds-radius-lg);
    border-top-right-radius: var(--ds-radius-lg);
    box-shadow: var(--ds-shadow-lg);
    padding: 0.4rem 1.1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    font-family: var(--ds-font-sans);
  }
  .ds-sheet-content[data-state='open'] { animation: ds-sheet-slide-up 0.2s ease; }
  /* Leaves a strip of backdrop as tall as the phone's bottom bar, so a tap
     above the sheet still closes it. */
  .ds-sheet-lg {
    max-height: calc(100vh - var(--ds-sheet-gap) - env(safe-area-inset-top, 0px) - var(--ds-keyboard-inset, 0px));
    max-height: calc(100dvh - var(--ds-sheet-gap) - env(safe-area-inset-top, 0px) - var(--ds-keyboard-inset, 0px));
  }
  .ds-sheet-content:focus-visible { outline: none; }

  .ds-sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--ds-color-border);
    margin: 0.4rem auto 0.75rem;
  }
  .ds-sheet-header {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    margin: 0 0 0.6rem;
  }
  .ds-sheet-header .ds-sheet-title { flex: 1 1 auto; min-width: 0; margin: 0; }
  .ds-sheet-actions { flex: none; display: flex; align-items: center; gap: var(--ds-space-sm); }
  .ds-sheet-title {
    margin: 0 0 0.6rem;
    font-size: var(--ds-text-lg);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
  }
  /* min-height: 0 lets the flex child shrink and scroll. */
  .ds-sheet-body {
    overflow-y: auto;
    min-height: 0;
    padding-bottom: 0.25rem;
  }
  .ds-sheet-body-fill {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
  }
  /* No box of their own: the children lay out in the body. */
  .ds-sheet-main,
  .ds-sheet-page { display: contents; }
  .ds-sheet-main[hidden] { display: none; }

  /* The sheet already sits on the on-screen keyboard: no inset here. */
  .ds-sheet-footer {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ds-space-sm);
    padding-top: var(--ds-space-md);
    border-top: 1px solid var(--ds-color-border);
    margin-top: var(--ds-space-sm);
  }

  @keyframes ds-sheet-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-sheet-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
</style>
