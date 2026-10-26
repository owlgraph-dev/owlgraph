<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The image's editor-only resize grip, on its free edge. A drag sets the
  // edited viewport's width from the pinned edge, or twice the distance from a
  // centred image's middle. Its place changes with every width, hence
  // `style:`, the editor-chrome exception (docs/architecture/blocks/anatomy.md).
  import { untrack } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import { editTier } from '../../capabilities/editTierStore';
  import { imagePlacement, resolvedAlign } from '../../capabilities/placement/placement';
  import { effectiveWidth, WIDTH_ATTR } from './imageWidth';
  import type { ImageEditing } from './view';
  import { frameScheduler, liveNodeOf } from '../scaffold/handles';
  import type { Tier } from '../../capabilities/cascade';

  let {
    editing,
    img,
    ruleId,
  }: {
    editing: ImageEditing;
    img: HTMLImageElement;
    /** The image's rule: a change means its width moved. */
    ruleId: string;
  } = $props();

  let left = $state(0);
  let top = $state(0);
  let edge = $state<'left' | 'right'>('right');
  let resizing = $state(false);
  let viewport: Tier = 'desktop';

  const liveNode = () => liveNodeOf(editing);
  // Its placement in the edited viewport, or the align it still renders.
  const alignOf = (attrs: Record<string, unknown>): 'start' | 'center' | 'end' => {
    const a = resolvedAlign(imagePlacement(attrs), viewport, 'image');
    return a === 'start' || a === 'end' ? a : 'center';
  };

  function measure() {
    if (resizing) return;
    const node = liveNode();
    if (!node) return;
    edge = alignOf(node.attrs) === 'end' ? 'left' : 'right';
    left = edge === 'right' ? img.offsetLeft + img.offsetWidth : img.offsetLeft;
    top = img.offsetTop + img.offsetHeight / 2;
  }

  // Measured a frame later: a width lands its rule in the editor's live sheet a microtask after.
  const { schedule, cancel: cancelFrames } = frameScheduler(() => measure());

  $effect(() => {
    const observer = new ResizeObserver(() => measure());
    observer.observe(img.parentElement ?? img);
    img.addEventListener('load', schedule);
    return () => {
      observer.disconnect();
      img.removeEventListener('load', schedule);
      cancelFrames();
    };
  });
  $effect(() => {
    void ruleId;
    untrack(schedule);
  });
  $effect(() =>
    editTier.subscribe((vp) => {
      viewport = vp;
      untrack(schedule);
    })
  );

  function startResize(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const node = liveNode();
    const frame = img.parentElement;
    if (!node || !frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return;
    const vp = viewport;
    const align = alignOf(node.attrs);
    const attr = WIDTH_ATTR[vp];
    // Undo returns to this tier's own value — inherited, when it had none.
    const own: number | null = typeof node.attrs[attr] === 'number' ? node.attrs[attr] : null;
    let last = effectiveWidth(node.attrs, vp) ?? 100;
    const compute = (clientX: number) => {
      const px = align === 'start' ? clientX - rect.left : align === 'end' ? rect.right - clientX : 2 * Math.abs(clientX - (rect.left + rect.width / 2));
      return Math.max(10, Math.min(100, Math.round((px / rect.width) * 100)));
    };
    const grip = e.currentTarget as HTMLElement;
    resizing = true;
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
    const move = (ev: PointerEvent) => {
      last = compute(ev.clientX);
      editing.setWidth(vp, last, false);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      try {
        grip.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      resizing = false;
      // The original back silently, then the final width as one undo step.
      editing.setWidth(vp, own, false);
      editing.setWidth(vp, last, true);
      editing.editor.view.focus();
      schedule();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  }

  // mousedown is swallowed so ProseMirror never starts a selection or the
  // image's native drag here.
  const grip: Attachment<HTMLElement> = (node) => {
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    node.addEventListener('mousedown', swallow);
    node.addEventListener('pointerdown', startResize);
    return () => {
      node.removeEventListener('mousedown', swallow);
      node.removeEventListener('pointerdown', startResize);
    };
  };
</script>

<div class="img-resize-handle" class:resizing contenteditable="false" data-edge={edge} style:left="{left}px" style:top="{top}px" {@attach grip}></div>

<style>
  .img-resize-handle {
    position: absolute;
    width: 10px;
    height: 34px;
    transform: translate(-50%, -50%);
    background: var(--ds-color-accent);
    border: 2px solid var(--ds-color-raised);
    border-radius: var(--ds-radius-md);
    cursor: ew-resize;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 3;
    box-shadow: var(--ds-shadow-sm);
    touch-action: none;
  }
  :global(.page-image-frame:hover) > .img-resize-handle,
  :global(.page-image-frame.ProseMirror-selectednode) > .img-resize-handle,
  .img-resize-handle.resizing {
    opacity: 1;
  }
</style>
