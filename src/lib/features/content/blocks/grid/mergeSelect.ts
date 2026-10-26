// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The block id of the grid whose merge selection is armed. Apart from the
// operations, so a module that must not reach ProseMirror can read it.
import { writable } from 'svelte/store';

export const mergeSelectFor = writable<string | null>(null);
