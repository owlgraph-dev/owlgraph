// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { SpacedBlockAttrs } from '../../doc/blockAttrs';

export interface CodeBlockAttrs extends SpacedBlockAttrs {
  language?: string | null;
}
