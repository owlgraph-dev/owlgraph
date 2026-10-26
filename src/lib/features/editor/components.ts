// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Svelte components, for browser and SSR consumers only; Node tooling imports
// ./index.ts, which stays free of .svelte files.
export { default as DesktopEditor } from './desktop/DesktopEditor.svelte';
export { default as DocumentEditor } from './document/DocumentEditor.svelte';
export { default as CollectionEditor } from './collection/CollectionEditor.svelte';
export { default as PhoneEditor } from './phone/PhoneEditor.svelte';
