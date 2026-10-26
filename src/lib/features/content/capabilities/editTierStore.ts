// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { writable } from 'svelte/store';
import type { Tier } from './cascade';

// The tier the editor edits and previews: editor UI state, never stored.
export const editTier = writable<Tier>('desktop');
