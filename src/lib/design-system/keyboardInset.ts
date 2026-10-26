// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The on-screen keyboard's height as `--ds-keyboard-inset` (docs/architecture/responsive.md,
// "The on-screen keyboard"): it covers the layout viewport without resizing it,
// so a bottom layer or a centred dialog that must stay visible subtracts it.

export interface VisualViewportLike {
  height: number;
  offsetTop: number;
  scale: number;
}

/** The layout viewport below the visible part, in px. */
export function keyboardInset(layoutHeight: number, vv: VisualViewportLike): number {
  // A pinch-zoom shrinks the visual viewport too, but nothing covers the page.
  if (vv.scale > 1.01) return 0;
  const covered = Math.round(layoutHeight - vv.height - vv.offsetTop);
  return covered > 0 ? covered : 0;
}

// The editor's canvas keeps its own caret in view.
function revealFocusedField() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el.isContentEditable || !el.matches('input, textarea, select')) return;
  el.scrollIntoView({ block: 'nearest' });
}

/** Returns the cleanup. The property is set only while a keyboard is up. */
export function trackKeyboardInset(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  let current = 0;
  const update = () => {
    const inset = keyboardInset(root.clientHeight, vv);
    if (inset === current) return;
    current = inset;
    if (inset > 0) {
      root.style.setProperty('--ds-keyboard-inset', `${inset}px`);
      requestAnimationFrame(revealFocusedField);
    } else {
      root.style.removeProperty('--ds-keyboard-inset');
    }
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    root.style.removeProperty('--ds-keyboard-inset');
  };
}
