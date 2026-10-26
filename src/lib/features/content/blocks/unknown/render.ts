// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The stand-in comes off before a save, so only an unsaved draft's preview
// meets one; the node it stands for renders nothing either (docs/architecture/blocks/anatomy.md,
// "Unknown blocks").
import type { BlockRenderer } from '../blockRenderer';

export const renderUnknownBlock: BlockRenderer = () => '';
