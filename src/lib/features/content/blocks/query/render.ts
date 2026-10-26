// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Each result is bound into a clone of the template before the ordinary walker
// renders it, so the walker never knows about templating.
import { esc } from '$lib/platform/htmlEscape';
import * as m from '$lib/paraglide/messages';
import { attrsOf } from '../../doc/doc';
import type { QueryBlockNodeAttrs } from './model';
import { bindTemplate } from '../../template/templateBinding';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperOpen } from '../scaffold/blockWrapper';
import { queryWrapper } from './view';

export type QueryBlockState = 'unconfigured' | 'empty' | 'error' | 'timeout';

const MESSAGES: Record<QueryBlockState, () => string> = {
  unconfigured: m.query_block_state_unconfigured,
  empty: m.query_block_state_empty,
  error: m.query_block_state_error,
  timeout: m.query_block_state_timeout
};

export function renderQueryBlockState(blockId: string | null | undefined, state: QueryBlockState): string {
  const idAttr = blockId ? ` data-block-id="${esc(blockId)}"` : '';
  return `<div class="query-block query-block--${state}"${idAttr}><div class="query-block-state">${esc(MESSAGES[state]())}</div></div>`;
}

export const renderQueryBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<QueryBlockNodeAttrs>(node);
  const blockId = a.blockId;
  const r = ctx.queryResults[blockId ?? ''] ?? { state: 'unconfigured' as const };
  if (r.state !== 'ok') return renderQueryBlockState(blockId, r.state);
  const containerNode = (node.content ?? [])[0];
  if (!containerNode) return renderQueryBlockState(blockId, 'empty');
  const mapping = a.mapping ?? undefined;
  const instances = r.items
    .map((item) => `<div class="query-block-instance">${ctx.renderNode(bindTemplate(containerNode, item, mapping))}</div>`)
    .join('');
  return `${wrapperOpen(queryWrapper(a, ctx.blockDefaults), node, ctx)}${instances}</div>`;
};
