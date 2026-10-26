// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { NodeType } from '$lib/features/nodes';

// Labels are translated in CreateModal.svelte: a static array can't follow a
// locale switch.
export type CreateCard = {
  id: string;
  icon: string; // Icon.svelte name
  kind: NodeType;
  templateId?: string; // reserved for template cards
  group: string;
};

export const CREATE_CARDS: CreateCard[] = [
  {
    id: 'blank-page',
    icon: 'file',
    kind: 'page',
    group: 'blank'
  },
  {
    id: 'blank-document',
    icon: 'file',
    kind: 'document',
    group: 'blank'
  },
  {
    id: 'blank-collection',
    icon: 'list-ordered',
    kind: 'collection',
    group: 'blank'
  }
];
