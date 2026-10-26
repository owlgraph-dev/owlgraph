// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Browser and SSR only: Node tooling imports ./index.ts. The reader's surface
// only: the editing shell lives in the editor feature.
export { default as CollectionNodeView } from './components/CollectionNodeView.svelte';
