// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One line per plugin that adds blocks. Keyed by the manifests' block names, so
// a plugin block without a renderer does not compile.
import type { BlockRenderer } from '$lib/features/content';
import type { PluginBlockKindName } from './index';
import { nextcloudRenderers } from './nextcloud/renderers';

export const PLUGIN_RENDERERS: Readonly<Record<PluginBlockKindName, BlockRenderer>> = {
  ...nextcloudRenderers,
};
