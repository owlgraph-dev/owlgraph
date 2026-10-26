// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Whether the app bar's Create dialog is open: shared, so the home page's
// "Create page" opens the same dialog. Set only by a click, so SSR reads `false`.
export const createDialog = $state({ open: false });
