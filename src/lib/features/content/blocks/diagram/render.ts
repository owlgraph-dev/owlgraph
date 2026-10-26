// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The server renders the waiting state; the source rides in the island's
// props, never as visible text.
import * as m from '$lib/paraglide/messages';
import { attrsOf } from '../../doc/doc';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import type { DiagramAttrs } from './model';
import { diagramProps, diagramWrapper } from './view';
import Diagram from './Diagram.svelte';

export const renderDiagramBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<DiagramAttrs>(node);
  const props = diagramProps(a, { waiting: m.diagram_block_state_waiting(), failed: m.diagram_block_state_error(), empty: null });
  return wrapperHtml({ ...diagramWrapper(a), island: { kind: 'diagram', props } }, node, ctx, ssrBlock(Diagram, props));
};
