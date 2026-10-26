<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts" generics="T">
  // An item moves by dragging its handle (pointer events) or with ↑/↓ on the
  // focused handle. Each move is reported as `onMove`; the consumer reorders and
  // the list draws what it is given.
  import { tick, type Snippet } from 'svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  let {
    items,
    key,
    onMove,
    handleLabel,
    instructions,
    announce,
    disabled = false,
    ariaLabel,
    class: className = '',
    item,
  }: {
    items: readonly T[];
    /** An item's stable key. */
    key: (item: T) => string;
    /** An item moved from one place to another (indexes into `items`). */
    onMove: (from: number, to: number) => void;
    /** The handle's accessible name for an item ("Move Chapter 1"). */
    handleLabel: (item: T) => string;
    /** How to move with the keyboard, read with the focused handle ("Press ↑ or ↓ to move."). */
    instructions: string;
    /** What a keyboard move says ("Chapter 1, position 2 of 5"). */
    announce: (item: T, position: number, count: number) => string;
    /** No moves while true (a move in flight). */
    disabled?: boolean;
    ariaLabel?: string;
    class?: string;
    /** One item's row, with its handle to place. */
    item: Snippet<[T, { handle: Snippet; index: number; dragging: boolean }]>;
  } = $props();

  const uid = $props.id();
  const instructionsId = `ds-sortable-${uid}`;
  let liveText = $state('');
  const handles = new Map<string, HTMLElement>();
  let list = $state<HTMLOListElement | null>(null);

  // A drag in progress: which item, where the pointer started, how far it went, where it would land.
  let drag = $state<{ index: number; pointerId: number; startY: number; offset: number; target: number; mids: number[] } | null>(null);

  function rowsOf(): HTMLElement[] {
    return list ? [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement) : [];
  }

  function start(event: PointerEvent, index: number) {
    if (disabled || event.button !== 0) return;
    const rows = rowsOf();
    const mids = rows.map((row) => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { index, pointerId: event.pointerId, startY: event.clientY, offset: 0, target: index, mids };
    event.preventDefault();
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const offset = event.clientY - drag.startY;
    const center = drag.mids[drag.index] + offset;
    // The place whose middle the dragged row's middle has passed.
    let target = drag.index;
    while (target < drag.mids.length - 1 && center > drag.mids[target + 1]) target++;
    while (target > 0 && center < drag.mids[target - 1]) target--;
    drag = { ...drag, offset, target };
  }

  function end(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { index, target } = drag;
    drag = null;
    if (target !== index) onMove(index, target);
  }

  function cancel() {
    drag = null;
  }

  async function keydown(event: KeyboardEvent, index: number, it: T) {
    if (event.key === 'Escape' && drag) {
      cancel();
      return;
    }
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step || disabled) return;
    event.preventDefault();
    const to = index + step;
    if (to < 0 || to >= items.length) return;
    onMove(index, to);
    await tick();
    // The row moved in the DOM, which may have taken the focus with it.
    handles.get(key(it))?.querySelector('button')?.focus();
    // Said only of a move that happened: the consumer may refuse one.
    const now = items.findIndex((other) => key(other) === key(it));
    if (now === to) liveText = announce(it, now + 1, items.length);
  }

  function register(node: HTMLElement, id: string) {
    handles.set(id, node);
    return {
      destroy() {
        if (handles.get(id) === node) handles.delete(id);
      },
    };
  }
</script>

<span id={instructionsId} class="ds-sortable-live">{instructions}</span>
<ol bind:this={list} class="ds-sortable {className}" aria-label={ariaLabel}>
  {#each items as it, index (key(it))}
    {@const dragging = drag?.index === index}
    {#snippet handle()}
      <span class="ds-sortable-handle" class:ds-sortable-handle-held={dragging} use:register={key(it)}>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={handleLabel(it)}
          title={handleLabel(it)}
          aria-describedby={instructionsId}
          {disabled}
          onpointerdown={(e: PointerEvent) => start(e, index)}
          onpointermove={move}
          onpointerup={end}
          onpointercancel={cancel}
          onkeydown={(e: KeyboardEvent) => keydown(e, index, it)}><Icon name="grip" size={16} /></Button
        >
      </span>
    {/snippet}
    <li
      class="ds-sortable-item"
      class:ds-sortable-dragging={dragging}
      class:ds-sortable-drop-before={drag !== null && !dragging && drag.target === index && drag.target < drag.index}
      class:ds-sortable-drop-after={drag !== null && !dragging && drag.target === index && drag.target > drag.index}
      style:transform={dragging && drag ? `translateY(${drag.offset}px)` : undefined}
    >
      {@render item(it, { handle, index, dragging })}
    </li>
  {/each}
</ol>
<div class="ds-sortable-live" aria-live="polite">{liveText}</div>

<style>
  .ds-sortable { list-style: none; margin: 0; padding: 0; }
  .ds-sortable-item { position: relative; }
  .ds-sortable-dragging {
    z-index: var(--ds-z-floating);
    background: var(--ds-color-raised-floating);
    box-shadow: var(--ds-shadow-md);
  }
  /* Where the dragged row lands: a line above or below the row it would take the place of. */
  .ds-sortable-drop-before::before,
  .ds-sortable-drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--ds-color-accent);
  }
  .ds-sortable-drop-before::before { top: -1px; }
  .ds-sortable-drop-after::after { bottom: -1px; }
  /* The handle takes the touch: dragging it never scrolls the page. */
  .ds-sortable-handle { display: inline-flex; touch-action: none; cursor: grab; }
  .ds-sortable-handle-held { cursor: grabbing; }
  .ds-sortable-live {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
