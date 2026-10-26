// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { LocalizedText } from '$lib/platform/i18n/localizedText';
import type { NodeType } from '$lib/features/nodes';

export interface CollectionMember {
  id: string;
  type: NodeType;
  title: string;
  url: string;
  /** From 1 among the members this viewer may read, so one they may not read leaves no gap to count. */
  position: number;
  /** In the viewer's language. */
  label: string | null;
  /** The label in every language it has, for its editors. */
  labelText: LocalizedText | null;
  /** The plugin id a member's source belongs to; null for one of the core's own. */
  plugin: string | null;
  pluginLabel: string | null;
}
