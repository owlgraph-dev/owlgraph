// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The table's agent input (joined into blockInputSchema.server.ts) and
// its mapping to a node. Agents author plain strings; the mapping builds the
// row and cell tree, row 0 the header row (model.ts).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JsonNode } from '../../doc/doc';

export const tableInputShape = z.object({
  kind: z.literal('table'),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  showHeader: z.boolean().optional(),
});

export type TableInput = z.infer<typeof tableInputShape>;

export function tableNode(input: TableInput): JsonNode {
  const cols = Math.max(1, input.headers.length);
  const cell = (text: string | undefined, isHeader: boolean): JsonNode => ({
    type: 'tableCell',
    attrs: { isHeader },
    content: text ? [{ type: 'text', text }] : [],
  });
  const row = (texts: readonly string[], isHeader: boolean): JsonNode => ({
    type: 'tableRow',
    attrs: { isHeader },
    content: Array.from({ length: cols }, (_, i) => cell(texts[i], isHeader)),
  });
  return {
    type: 'table',
    attrs: { columnWidths: null, showHeader: input.showHeader ?? true, blockId: randomUUID() },
    content: [row(input.headers, true), ...input.rows.map((r) => row(r, false))],
  };
}
