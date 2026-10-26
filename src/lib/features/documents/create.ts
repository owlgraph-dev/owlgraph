// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An entry of its own beside ./components.ts: a component brings its stylesheet,
// so a barrel's unused exports are never tree-shaken, and every page showing a
// document would carry the form (docs/architecture/overview.md).
export { default as NewDocumentForm } from './create/NewDocumentForm.svelte';
