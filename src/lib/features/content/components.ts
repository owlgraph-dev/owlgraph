// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The reader's Svelte components; Node tooling imports ./index.ts instead. A
// barrel's components can't be tree-shaken (each brings its CSS), so editing
// UI lives with the editor and admin UI beside its route adapter (./routes/).
export { default as RenderedContent } from './components/RenderedContent.svelte';
