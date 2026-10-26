// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What TreeBrowser.svelte browses and hands back. Paths are relative to the
// collection's root, or to the editor's own files.

export type TreeSource =
  /** A collection's tree; null lets the editor pick the collection first. */
  | { kind: 'collection'; collectionId: string | null }
  | { kind: 'own' };

export type TreeChoice =
  | { kind: 'collection'; collectionId: string; path: string; fileid: string | null; name: string }
  | { kind: 'own'; path: string; fileid: string | null; name: string };
