// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A stored document as the editor reads it: the stand-ins for unknown blocks,
// strays in sections, placeholders back in (docs/architecture/blocks/anatomy.md, "Unknown blocks").
import { getSchema, type Extensions } from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { rehydratePlaceholders, wrapUnknown, unwrapUnknown, normalizeStrays, pageColumnsOf, type JsonDoc, type PageLayout } from '$lib/features/content';

/** The doc-load preparation, before the schema reads it; `heldAs` repeats it. Mutates `doc`. */
export function preparedForEditor(doc: JsonDoc): JsonDoc {
  // First, whole: ProseMirror refuses a document over a single unknown type,
  // and nothing below may reach into one (content/doc/unknownBlocks.ts).
  let prepared = wrapUnknown(doc);
  // A block stored outside a section on a columns page (an agent's append)
  // is put in one, as the renderer shows it.
  prepared = normalizeStrays(prepared, pageColumnsOf(prepared.attrs?.layout as PageLayout | undefined), 'placeholder') as JsonDoc;
  // Placeholders are never stored, but doc and cells require a child: one
  // whose only content was a placeholder comes back empty and is refilled.
  rehydratePlaceholders(prepared);
  return prepared;
}

/**
 * The prepared document read with Tiptap's schema, as Tiptap is about to
 * read it; null where that fails, since Tiptap would open the page empty.
 */
export function readAsEditor(extensions: Extensions, doc: JsonDoc): ProseMirrorNode | null {
  try {
    return getSchema(extensions).nodeFromJSON(doc);
  } catch {
    return null;
  }
}

/**
 * A document as an editor of this schema would hold it, every omitted
 * attribute at its default; as it came when the schema cannot read it.
 */
export function heldAs(schema: Schema, doc: object): unknown {
  try {
    return unwrapUnknown(schema.nodeFromJSON(preparedForEditor(structuredClone(doc) as JsonDoc)).toJSON() as JsonDoc);
  } catch {
    return doc;
  }
}
