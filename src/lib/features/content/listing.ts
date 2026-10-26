// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Shared listings (docs/architecture/blocks/anatomy.md, "Shared listings"):
// presentation-only components that import no stylesheet (their CSS is in
// blocks/blocks.css) and never reach the editor, a server module or a plugin.
export { default as EntryList } from './listing/EntryList.svelte';
export { default as DocumentEntry } from './listing/DocumentEntry.svelte';
export type { DocumentEntryFile, DocumentPlaceholder, EntryPlaceholder, EntryRow, EntryTarget } from './listing/types';
export { dateText, fileGlyph, fill, opensInline, sizeText, typeLabel } from './listing/format';
export { memberRows, type MemberEntry, type MemberTexts } from './listing/members';
export type { NodeType } from '$lib/features/nodes';
