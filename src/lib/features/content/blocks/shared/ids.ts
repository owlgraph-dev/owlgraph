// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The fallback covers a runtime without crypto.randomUUID (a non-secure
// context), unique enough for a document's lifetime.
export const newBlockId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `b-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
