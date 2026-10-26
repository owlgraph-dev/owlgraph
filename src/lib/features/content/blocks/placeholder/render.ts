// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Stripped before persist; registered so it never falls to the unknown-type path.
import type { BlockRenderer } from '../blockRenderer';

export const renderPlaceholder: BlockRenderer = () => '';
