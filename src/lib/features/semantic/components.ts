// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Svelte components only; Node tooling imports ./index.ts, which has no .svelte
// file. The settings pages' modals live in ./routes/.
export { default as ClassFieldsPanel } from './components/ClassFieldsPanel.svelte';
export { default as LocalizedField } from './components/LocalizedField.svelte';
export { default as PagePropertiesDialog } from './components/PagePropertiesDialog.svelte';
export { default as RelationshipPicker } from './components/RelationshipPicker.svelte';
