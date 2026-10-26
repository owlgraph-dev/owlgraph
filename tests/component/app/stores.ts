// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// `$app/stores` for component tests: the same objects as state.svelte.ts, as stores.
import { readable, toStore } from 'svelte/store';
import { navigating as navigation, page as current } from './state.svelte';

export const page = toStore(() => current);
export const navigating = toStore(() => (navigation.to ? navigation : null));
export const updated = { ...readable(false), check: async () => false };
