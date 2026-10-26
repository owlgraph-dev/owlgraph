// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An entry apart from ./components.ts, which the root layout imports on every
// page: a component brings its stylesheet, so a barrel's unused exports aren't
// tree-shaken and every reader would carry the picker (docs/architecture/overview.md).
export { default as NodePicker } from './picker/NodePicker.svelte';
export { default as NodePickerPanel } from './picker/NodePickerPanel.svelte';
export { default as PagePicker } from './picker/PagePicker.svelte';
export { pickerNamespace, type NodeMark, type NodePickerCreate, type PickerRow } from './picker/nodePicker';
