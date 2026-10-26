// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { writable } from 'svelte/store';

// A module store, not a prop: the overlay is mounted once in the root layout,
// while the trigger and the global Cmd/Ctrl-K handler toggle it from elsewhere.
export const searchOverlayOpen = writable(false);
