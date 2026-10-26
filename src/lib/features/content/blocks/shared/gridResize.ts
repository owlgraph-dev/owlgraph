// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Drag-to-resize for grid and table dividers. Each pointermove previews without
// history; the release commits once, so a drag is one undo step.

export interface DragResizeHandlers<T> {
  computeNext: (ev: PointerEvent) => T;
  /** `history: false` is the live preview (no undo entry); `true` the final commit. */
  apply: (value: T, history: boolean) => void;
  positionHandle?: (ev: PointerEvent) => void;
  onStart?: () => void;
  /** Called once after the drag ends, successful or not. */
  onSettled?: () => void;
}

export function startDragResize<T>(
  e: PointerEvent,
  handle: HTMLElement,
  initial: T,
  handlers: DragResizeHandlers<T>
): void {
  e.preventDefault();
  e.stopPropagation();
  handlers.onStart?.();
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    /* not supported */
  }
  let last = initial;
  const onMove = (ev: PointerEvent) => {
    last = handlers.computeNext(ev);
    handlers.apply(last, false);
    handlers.positionHandle?.(ev);
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // Restore silently, then commit the final value as one undo step.
    handlers.apply(initial, false);
    handlers.apply(last, true);
    handlers.onSettled?.();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
}

/**
 * The smallest share of the whole a track (a column) has, in percent: a drag
 * stops there, and a track stored narrower is drawn at it (flooredWeights).
 */
export const MIN_TRACK_PERCENT = 5;

/**
 * Every track raised to MIN_TRACK_PERCENT of the total, as it is drawn and
 * dragged; equal weights when there are more tracks than the floor allows.
 */
export function flooredWeights(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return weights.map(() => 1);
  const floorPct = Math.min(MIN_TRACK_PERCENT, 100 / weights.length);
  const floor = (total * floorPct) / 100;
  return weights.map((w) => Math.max(w, floor));
}

/**
 * One more track at the end, as wide as the average, so a new column takes an
 * even share however the weights are scaled (1s, or a drag's percents).
 */
export function withAddedTrack(weights: readonly number[]): number[] {
  const mean = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 1;
  return [...weights, Math.max(1, Math.round(mean))];
}

// Splits two adjacent tracks' combined share at `fraction` (0..1) of their span,
// as whole percents summing 100 (drift onto the largest track), each at least
// `minPercent`; a pair narrower than two minimums splits evenly.
export function previewWeights(w0: number[], k: number, fraction: number, minPercent = MIN_TRACK_PERCENT): number[] {
  const total = w0.reduce((a, b) => a + b, 0) || 1;
  const pct = w0.map((x) => (x / total) * 100);
  const pair = pct[k] + pct[k + 1];
  // Whole percents below: the floor rounds up, so rounding never takes a track under it.
  const minPct = Math.min(Math.ceil(minPercent), pair / 2);
  const left = Math.max(minPct, Math.min(pair - minPct, fraction * pair));
  pct[k] = left;
  pct[k + 1] = pair - left;
  const r = pct.map((x) => Math.round(x));
  const drift = 100 - r.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    let mi = 0;
    for (let i = 1; i < r.length; i++) if (r[i] > r[mi]) mi = i;
    r[mi] += drift;
  }
  return r.map((x) => Math.max(1, x));
}
