// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The components the Nextcloud plugin's blocks hydrate on the page
// (docs/architecture/plugins.md), by island kind.
import type { PluginIslands } from '$lib/plugins/api';
import FolderListing from './blocks/folder/FolderListing.svelte';
import { FOLDER_ISLAND } from './blocks/folder/model';

export const nextcloudIslands: PluginIslands = {
  [FOLDER_ISLAND]: FolderListing,
};
