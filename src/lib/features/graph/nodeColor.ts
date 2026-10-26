// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Node colouring (docs/architecture/graph-view.md). Slots are assigned over the whole loaded
// graph, so a filter never repaints the survivors. A class takes its slot by
// its slug, never its localized label, so it keeps its colour in every language.
import type { GraphNode } from './types';
import type { ColorBy } from './settings';

// Scheme tokens. The slots' order is validated against colour-vision
// deficiency on each scheme's ground: re-validate if a step changes.
export const PAGE_COLOR = 'var(--ds-color-accent)';
export const DOCUMENT_COLOR = 'var(--ds-viz-document)';
export const VIZ_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((slot) => `var(--ds-viz-${slot})`);
export const OTHER_COLOR = 'var(--ds-viz-other)';

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  shape: 'circle' | 'square' | 'diamond';
}

export interface ColorScheme {
  colorOf(node: GraphNode): string;
  // The categories among `visibleNodes` by label, "other" last.
  legend(visibleNodes: readonly GraphNode[]): LegendEntry[];
}

export interface ColorLabels {
  page: string;
  document: string;
  collection: string;
  other: string;
  classLabel(classId: string): string | null;
  // The class's slug: the stable key its colour slot is assigned by.
  classKey(classId: string): string | null;
  namespaceLabel(namespaceId: string): string | null;
}

const keyOf = (colorBy: ColorBy, n: GraphNode): string | null =>
  colorBy === 'class' ? (n.classId ?? null) : colorBy === 'namespace' ? (n.namespaceId ?? null) : (n.type ?? 'page');

export function buildColorScheme(colorBy: ColorBy, allNodes: readonly GraphNode[], labels: ColorLabels): ColorScheme {
  if (colorBy === 'type') {
    // A collection is the neutral colour on its own shape: no slot is spent on a node type.
    return {
      colorOf: (n) => (n.type === 'document' ? DOCUMENT_COLOR : n.type === 'collection' ? OTHER_COLOR : PAGE_COLOR),
      legend: (visibleNodes) => [
        { key: 'page', label: labels.page, color: PAGE_COLOR, shape: 'circle' },
        { key: 'document', label: labels.document, color: DOCUMENT_COLOR, shape: 'square' },
        ...(visibleNodes.some((n) => n.type === 'collection') ? [{ key: 'collection', label: labels.collection, color: OTHER_COLOR, shape: 'diamond' as const }] : []),
      ],
    };
  }

  const labelOf = (key: string): string => (colorBy === 'class' ? labels.classLabel(key) : labels.namespaceLabel(key)) ?? key;
  // Sorted by a key that isn't localized: a class's slug, a namespace's name.
  const slotKeyOf = (key: string): string => (colorBy === 'class' ? labels.classKey(key) : labels.namespaceLabel(key)) ?? key;
  const keys = [...new Set(allNodes.map((n) => keyOf(colorBy, n)).filter((k): k is string => k != null))];
  keys.sort((a, b) => slotKeyOf(a).localeCompare(slotKeyOf(b)));
  const slotOf = new Map(keys.map((k, i) => [k, i]));
  const colorOfKey = (key: string | null): string => {
    const slot = key != null ? slotOf.get(key) : undefined;
    return slot != null && slot < VIZ_COLORS.length ? VIZ_COLORS[slot] : OTHER_COLOR;
  };

  return {
    colorOf: (n) => colorOfKey(keyOf(colorBy, n)),
    legend: (visibleNodes) => {
      const present = new Set(visibleNodes.map((n) => keyOf(colorBy, n)));
      const entries: LegendEntry[] = [];
      let hasOther = present.has(null);
      for (const key of keys) {
        if (!present.has(key)) continue;
        const slot = slotOf.get(key)!;
        if (slot >= VIZ_COLORS.length) { hasOther = true; continue; }
        entries.push({ key, label: labelOf(key), color: VIZ_COLORS[slot], shape: 'circle' });
      }
      entries.sort((a, b) => a.label.localeCompare(b.label));
      if (hasOther) entries.push({ key: '__other', label: labels.other, color: OTHER_COLOR, shape: 'circle' });
      return entries;
    },
  };
}
