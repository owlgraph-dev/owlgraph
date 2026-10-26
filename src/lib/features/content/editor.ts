// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Editor-only surface: the Tiptap nodes and marks and the operations on them.
// It reaches ProseMirror, so it stays out of ./index.ts, which the reader
// routes and Node tooling import.
export * from './blocks/callout/tiptap';
export * from './inline/customStyle';
export * from './blocks/table/tiptap';
export * from './blocks/table/operations';
export * from './inline/docLink';
export * from './inline/link';
export * from './blocks/heading/tiptap';
export * from './blocks/html/tiptap';
export * from './blocks/image/tiptap';
export * from './blocks/flex/tiptap';
export * from './blocks/flex/operations';
export * from './blocks/grid/tiptap';
export * from './blocks/grid/operations';
export * from './blocks/grid/mergeSelect';
export * from './blocks/section/tiptap';
export * from './blocks/list/tiptap';
export * from './blocks/diagram/tiptap';
export * from './inline/pageLink';
export * from './blocks/paragraph/tiptap';
export * from './blocks/placeholder/tiptap';
export * from './blocks/placeholder/placeholderOps';
export * from './blocks/query/tiptap';
export * from './blocks/quickLink/tiptap';
export * from './blocks/quickLink/embed';
export * from './inline/semanticProperty';
export * from './blocks/shared/blockId';
export * from './blocks/shared/blockOps';
export * from './blocks/shared/blockSpacing';
export * from './blocks/shared/cellBoundaries';
export * from './color/schemeRegionDecorations';
export * from './capabilities/liveStyles';
export * from './capabilities/typography/typographyMarks';
export * from './blocks/tiptap';
// The block kit's editor half, for blocks outside this feature (docs/architecture/plugins.md).
export * from './blocks/scaffold/svelteNodeView.svelte';
