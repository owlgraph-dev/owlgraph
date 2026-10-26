// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { writable } from 'svelte/store';

// Module-level, so the sidebar stays open at its width across client-side
// navigation; a full reload resets both.
export const localGraphOpen = writable(false);
export const localGraphWidth = writable(360); // px
