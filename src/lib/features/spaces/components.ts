// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Svelte components of the spaces feature (browser/SSR consumers only —
// Node tooling must import ./index.ts, which stays free of .svelte files).
export { default as SpaceMembersModal } from './components/SpaceMembersModal.svelte';
export { default as SpaceModal } from './components/SpaceModal.svelte';
