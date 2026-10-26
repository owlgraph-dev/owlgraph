// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Wherever a node is listed by its type: its glyph (each name exists in both
// the chrome's Icon set and the content glyphs) and its name.
import * as m from '$lib/paraglide/messages';
import type { NodeType } from './types';

export const NODE_TYPE_GLYPH: Readonly<Record<NodeType, string>> = { page: 'file-text', document: 'file', collection: 'layers' };

export const NODE_TYPE_LABEL: Readonly<Record<NodeType, () => string>> = { page: m.node_type_page, document: m.node_type_document, collection: m.node_type_collection };
