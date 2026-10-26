// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The content feature's entry point: plain TypeScript, safe in the
// browser, on the server and under Node tooling. Never re-export
// ./components.ts, ./server.ts or ./editor.ts from here: the last would pull
// ProseMirror into every reader route.
export * from './blocks/placeholder/placeholderDoc';
export * from './blocks/image/imageBox';
export * from './blocks/image/imageWidth';
export * from './blocks/grid/gridStyle';
export * from './blocks/grid/gridColumns';
export * from './blocks/quickLink/model';
export * from './blocks/collection/model';
export * from './blocks/document/model';
export * from './blocks/embeds';
export * from './blocks/collectBlocks';
export { makeTable } from './blocks/table/model';
export * from './blocks/quickLink/variants';
export * from './blocks/shared/markFieldState';
export * from './blocks/catalog';
export * from './blocks/facets';
// The block kit's page half, for blocks outside this feature (docs/architecture/plugins.md):
// the render contract and the block wrapper. The editor half is in ./editor.ts.
export * from './blocks/blockRenderer';
export * from './blocks/scaffold/blockWrapper';
export { dataAttr, textValue, flagValue } from './blocks/scaffold/dataAttr';
export { islandMarker, ISLAND_ATTR, ISLAND_PROPS_ATTR } from './blocks/scaffold/hydrateIslands';
export * from './render/linkTarget';
export * from './capabilities/detect';
export { hasAnyOwnValue, hasOwnValueAt, clearTier, canvasTier, TIERS, TIER_CHAR, type Tier } from './capabilities/cascade';
export * from './capabilities/defaults/tokens';
export * from './capabilities/defaults/blockDefaults';
export * from './capabilities/defaults/defaultsRegistry';
export * from './capabilities/defaults/emitDefaults';
export * from './capabilities/defaults/contentTheme';
export * from './capabilities/layout/layout';
export * from './capabilities/placement/placement';
export * from './capabilities/flexItem/flexItem';
export * from './capabilities/spacing/spacing';
export * from './capabilities/parse';
export * from './capabilities/surface/surface';
export * from './capabilities/surface/surfaceImage';
export * from './capabilities/height/height';
export * from './capabilities/typography/fonts';
export * from './capabilities/typography/roles';
export * from './capabilities/typography/paragraphStyles';
export * from './capabilities/typography/typeScale';
export * from './capabilities/typography/typography';
export * from './capabilities/typography/typographyRegistry';
export * from './capabilities/typography/emitParagraphStyles';
export * from './capabilities/overrides';
export * from './capabilities/pageStyles';
export * from './blocks/code/highlight';
export * from './page/pageLayout';
export * from './page/pageAttrs';
export * from './page/pageColumns';
export * from './page/pageSections';
export * from './blocks/image/assetSizeRegistry';
export * from './blocks/image/leadImage';
export type { ImageSize } from './blocks/image/imageSources';
export * from './color/contentScheme';
export * from './color/colorTokens';
export * from './color/colorTokenOptions';
export * from './color/colorSwatches';
export * from './color/brandColors';
export * from './inline/customStyleRegistry';
export * from './color/adaptiveReadiness';
export * from './color/schemeRegions';
export * from './color/themeColorContrast';
export * from './color/contrastGuidance';
export * from './color/contrastGuidanceText';
export * from './blocks/diagram/mermaidTheme';
export * from './blocks/diagram/mermaidFrame';
export * from './blocks/query/formats';
export * from './blocks/query/render';
export * from './blocks/query/result';
export * from './template/templateBinding';
export * from './template/templateParams';
export * from './template/templateTransforms';
export * from './capabilities/editTierStore';
export * from './doc/doc';
export * from './doc/assetRefs';
export * from './doc/blockAttrs';
export * from './doc/unknownBlocks';
