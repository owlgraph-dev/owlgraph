// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin's renderers for renderDoc, one per block kind (docs/architecture/plugins.md).
import { definePluginRenderers } from '$lib/plugins/api';
import { nextcloud } from './index';
import { renderFolderBlock } from './blocks/folder/render';
import { renderFileBlock } from './blocks/file/render';

export const nextcloudRenderers = definePluginRenderers(nextcloud, {
  nextcloudFolder: renderFolderBlock,
  nextcloudFile: renderFileBlock,
});
