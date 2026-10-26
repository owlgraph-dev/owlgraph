// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One line per plugin with an island. content/blocks/islands.ts spreads it, so
// a plugin island ships in the page's bundle, CSS included, like a core block's.
import type { PluginIslands } from './api';
import { nextcloudIslands } from './nextcloud/islands';

export const PLUGIN_ISLANDS: PluginIslands = {
  ...nextcloudIslands,
};
