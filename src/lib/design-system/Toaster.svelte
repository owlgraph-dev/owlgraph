<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Renders toast.svelte.ts's toasts, mounted once in the root layout. A toast
  // never takes focus; pointer or focus inside the stack pauses the timers, and
  // Escape closes the newest. The live regions exist from the first render, so
  // a toast is announced reliably.
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';
  import { toaster, type ToastItem } from './toast.svelte';

  let {
    regionLabel,
    closeLabel,
    class: className = '',
  }: {
    /** Names the stack as a landmark region ("Notifications"). */
    regionLabel: string;
    /** The close button's accessible name ("Dismiss"). */
    closeLabel: string;
    /** A class setting `--ds-toaster-phone-bottom`, the height of a bar fixed to
     * a phone's bottom; not a style attribute, which the reader's routes refuse. */
    class?: string;
  } = $props();

  const glyph = { danger: 'alert-circle', warning: 'alert-triangle', info: 'info', success: 'check' } as const;

  let stack = $state<HTMLElement | null>(null);

  function runAction(item: ToastItem) {
    item.action?.onClick();
    toaster.dismiss(item.id);
  }

  // Listeners, not template handlers: the stack is a landmark, not a control.
  $effect(() => {
    const el = stack;
    if (!el) return;
    const pause = () => toaster.pause();
    const leave = () => { if (!el.contains(document.activeElement)) toaster.resume(); };
    const focusout = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) toaster.resume(); };
    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', focusout);
    el.addEventListener('keydown', onkeydown);
    return () => {
      el.removeEventListener('pointerenter', pause);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', focusout);
      el.removeEventListener('keydown', onkeydown);
    };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    const visible = toaster.visible;
    const newest = visible[visible.length - 1];
    if (!newest) return;
    e.preventDefault();
    e.stopPropagation();
    toaster.dismiss(newest.id);
    // Focus stays in the stack while a toast is left; else the timers resume.
    const next = stack?.querySelector<HTMLElement>('.ds-toast button');
    if (next) next.focus();
    else toaster.resume();
  }
</script>

<section
  bind:this={stack}
  class="ds-toaster {className}"
  aria-label={regionLabel}
>
  {#if toaster.visible.length}
    <ol class="ds-toaster-list">
      {#each toaster.visible as item (item.id)}
        <li class="ds-toast ds-toast-{item.tone}">
          <span class="ds-toast-icon" aria-hidden="true"><Icon name={glyph[item.tone]} size={16} /></span>
          <p class="ds-toast-message">{item.message}</p>
          <div class="ds-toast-controls">
            {#if item.action}
              <Button size="sm" variant="secondary" onclick={() => runAction(item)}>{item.action.label}</Button>
            {/if}
            <Button size="sm" variant="ghost" icon title={closeLabel} aria-label={closeLabel} onclick={() => toaster.dismiss(item.id)}><Icon name="x" size={14} /></Button>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</section>
<!-- aria-live, not role="status"/"alert": always present and usually empty,
     they must not answer a page's search for its alert. -->
<div class="ds-toaster-live" aria-live="polite" aria-atomic="true">{toaster.polite}</div>
<div class="ds-toaster-live" aria-live="assertive" aria-atomic="true">{toaster.assertive}</div>

<style>
  .ds-toaster {
    position: fixed;
    right: var(--ds-space-md);
    bottom: var(--ds-space-md);
    z-index: var(--ds-z-floating);
    width: min(24rem, calc(100vw - 2 * var(--ds-space-md)));
    pointer-events: none;
  }
  .ds-toaster-list {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ds-toast {
    --ds-toast-tone: var(--ds-color-info);
    display: flex;
    align-items: flex-start;
    gap: var(--ds-space-sm);
    box-sizing: border-box;
    padding: var(--ds-space-sm) var(--ds-space-sm) var(--ds-space-sm) 0.75rem;
    background: var(--ds-color-raised);
    color: var(--ds-color-fg);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    line-height: 1.5;
    pointer-events: auto;
    animation: ds-toast-in 160ms ease-out;
  }
  .ds-toast-danger { --ds-toast-tone: var(--ds-color-danger); }
  .ds-toast-warning { --ds-toast-tone: var(--ds-color-warning); }
  .ds-toast-success { --ds-toast-tone: var(--ds-color-success); }
  /* The glyph carries the tone; the message stays body text. */
  .ds-toast-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    height: var(--ds-control-h-sm);
    color: var(--ds-toast-tone);
  }
  .ds-toast-message {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    padding-block: calc((var(--ds-control-h-sm) - 1.5em) / 2);
    overflow-wrap: anywhere;
  }
  .ds-toast-controls { display: flex; flex: none; align-items: center; gap: 0.25rem; }
  /* Pinned top-left like SvelteKit's route announcer: after the page, its pixel
     would give a page exactly the screen's height a scroll. */
  .ds-toaster-live {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @keyframes ds-toast-in {
    from { opacity: 0; transform: translateY(0.5rem); }
    to { opacity: 1; transform: none; }
  }
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .ds-toaster {
      right: var(--ds-space-sm);
      left: var(--ds-space-sm);
      bottom: calc(var(--ds-toaster-phone-bottom, 0px) + var(--ds-keyboard-inset, 0px) + var(--ds-space-sm));
      width: auto;
      margin-inline: auto;
      max-width: 24rem;
    }
  }
</style>
