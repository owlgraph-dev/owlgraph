// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { db } from '../../src/lib/platform/db.server';
import type { DocNode } from '../e2e/doc';

/** A page's document as the database holds it. */
export async function storedDoc(pageId: string): Promise<{ type: string; content: DocNode[] }> {
  const [row] = await db<{ doc: { type: string; content: DocNode[] } }[]>`select doc from pages where id = ${pageId}`;
  return row.doc;
}
