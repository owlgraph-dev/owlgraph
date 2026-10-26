<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Dialog as BitsDialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { lockBodyScroll } from './scrollLock';

  let {
    open = $bindable(false),
    onOpenChange,
    title,
    description,
    size = 'md',
    variant = 'default',
    body = 'scroll',
    class: className = '',
    children,
    footer,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    title: string;
    description?: string;
    /** `xl` fits a four-column builder grid. */
    size?: 'sm' | 'md' | 'lg' | 'xl';
    variant?: 'default' | 'danger';
    /** `fill`: the body never scrolls; its one child (`flex: 1 1 auto;
     * min-height: 0`) fills it and decides what scrolls. */
    body?: 'scroll' | 'fill';
    class?: string;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  // Scroll lock is this app's own (scrollLock.ts), not Bits UI's, whose
  // release writes the style attribute a strict style-src blocks.
  $effect(() => {
    if (open) return lockBodyScroll();
  });
</script>

<!-- Every Bits UI part renders through its `child` snippet, so the styles are
     scoped (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"); a
     consumer's `class` plus :global(.ds-dialog-content.x) overrides them. -->
<BitsDialog.Root bind:open {onOpenChange}>
  <BitsDialog.Portal>
    <BitsDialog.Overlay>
      {#snippet child({ props }: { props: Record<string, unknown> })}
        <div {...props} class="ds-dialog-overlay"></div>
      {/snippet}
    </BitsDialog.Overlay>
    <BitsDialog.Content preventScroll={false}>
      {#snippet child({ props }: { props: Record<string, unknown> })}
      <div {...props} class="ds-dialog-content ds-dialog-{size} ds-dialog-{variant} {className}">
      <BitsDialog.Title>
        {#snippet child({ props: titleProps }: { props: Record<string, unknown> })}
          <div {...titleProps} class="ds-dialog-title">{title}</div>
        {/snippet}
      </BitsDialog.Title>
      {#if description}
        <BitsDialog.Description>
          {#snippet child({ props: descriptionProps }: { props: Record<string, unknown> })}
            <div {...descriptionProps} class="ds-dialog-description">{description}</div>
          {/snippet}
        </BitsDialog.Description>
      {/if}
      <!-- Not focusable itself (Svelte's a11y rule forbids the tabindex): its
           controls, or the browser's focusable scrollers, reach it. -->
      <div class="ds-dialog-body" class:ds-dialog-body-fill={body === 'fill'}>
        {@render children?.()}
      </div>
      {#if footer}
        <div class="ds-dialog-footer">
          {@render footer()}
        </div>
      {/if}
      </div>
      {/snippet}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
  .ds-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    /* Not right: 0: html's `scrollbar-gutter: stable` stays reserved under the
       scroll lock, and 100vw reaches the true window edge. */
    width: 100vw;
    background: var(--ds-color-scrim);
    z-index: var(--ds-z-scrim);
  }
  .ds-dialog-overlay[data-state='open'] { animation: ds-dialog-fade 0.15s ease; }

  .ds-dialog-content {
    position: fixed;
    z-index: var(--ds-z-modal);
    /* Centred in what the on-screen keyboard leaves visible (keyboardInset.ts). */
    top: calc(50% - var(--ds-keyboard-inset, 0px) / 2);
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--ds-color-raised-modal);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-lg);
    padding: var(--ds-space-md) 1.1rem;
    font-family: var(--ds-font-sans);
    /* Bounded to the viewport; the body scrolls, title and footer stay. No
       opt-out: a dropdown inside must be a floating layer of its own, never an
       absolute child the body would clip. */
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 2rem - var(--ds-keyboard-inset, 0px));
    max-height: calc(100dvh - 2rem - var(--ds-keyboard-inset, 0px));
  }
  .ds-dialog-content[data-state='open'] { animation: ds-dialog-in 0.15s ease; }
  .ds-dialog-content:focus-visible { outline: none; }

  .ds-dialog-sm { width: min(320px, 94vw); }
  .ds-dialog-md { width: min(420px, 94vw); }
  .ds-dialog-lg { width: min(640px, 94vw); }
  .ds-dialog-xl { width: min(720px, 94vw); }

  .ds-dialog-title {
    margin: 0 0 0.4rem;
    font-size: var(--ds-text-lg);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
  }
  .ds-dialog-danger .ds-dialog-title { color: var(--ds-color-danger); }
  .ds-dialog-description {
    margin: 0;
    color: var(--ds-color-muted);
    font-size: var(--ds-text-sm);
    line-height: 1.5;
  }
  .ds-dialog-body {
    margin-top: 0.6rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  /* The child shrinks to the room left, so this box never scrolls. */
  .ds-dialog-body-fill {
    display: flex;
    flex-direction: column;
  }
  .ds-dialog-footer {
    flex: none;
    display: flex;
    justify-content: flex-end;
    gap: var(--ds-space-sm);
    margin-top: var(--ds-space-md);
  }

  @keyframes ds-dialog-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-dialog-in {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.97); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
</style>
