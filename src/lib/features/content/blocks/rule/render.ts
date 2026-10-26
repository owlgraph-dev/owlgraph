// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { blockIdAttribute, spaceAboveAttribute, type BlockRenderer } from '../blockRenderer';

export const renderHorizontalRule: BlockRenderer = (node, ctx) => `<hr${blockIdAttribute(node)}${spaceAboveAttribute(node, ctx)}/>`;
