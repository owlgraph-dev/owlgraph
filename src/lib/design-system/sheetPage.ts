// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A part of a BottomSheet's content shows a page in the sheet instead of a
// dialog stacked on it; back or Escape returns to the content, still mounted.
// A part that finds no outlet opens its own layer.
import type { Snippet } from 'svelte';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('ds-sheet-page');

export interface SheetPage {
  /** The sheet's title while the page shows. */
  title: string;
  /** The back button's accessible name: the design system imports no i18n. */
  backLabel: string;
  /** The page's owner closes it. */
  onBack: () => void;
  body: Snippet;
  /** As BottomSheet's own `body`: `fill` for a page that scrolls a part of its own. */
  fill?: boolean;
}

export interface SheetPageOutlet {
  /** Shows a page over the sheet's content; the function returned takes it away. */
  show(page: SheetPage): () => void;
}

export function setSheetPageOutlet(outlet: SheetPageOutlet): void {
  setContext(KEY, outlet);
}

export function getSheetPageOutlet(): SheetPageOutlet | null {
  return getContext<SheetPageOutlet | undefined>(KEY) ?? null;
}
