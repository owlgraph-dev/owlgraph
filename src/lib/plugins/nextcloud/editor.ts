// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Nextcloud plugin's editor half (docs/architecture/plugins.md): per block kind its
// Tiptap node, its name, its Insert-menu entry and its block settings sections.
import { definePluginEditor } from '$lib/plugins/api';
import { nextcloud } from './index';
import { t } from './messages';
import { folderExtension } from './blocks/folder/tiptap';
import { newFolderNode } from './blocks/folder/model';
import FolderSourceSection from './blocks/folder/FolderSourceSection.svelte';
import FolderDisplaySection from './blocks/folder/FolderDisplaySection.svelte';
import { fileExtension } from './blocks/file/tiptap';
import { newFileNode } from './blocks/file/model';
import FileSourceSection from './blocks/file/FileSourceSection.svelte';
import FileDisplaySection from './blocks/file/FileDisplaySection.svelte';

export const nextcloudEditor = definePluginEditor(nextcloud, {
  id: 'nextcloud',
  blocks: {
    nextcloudFolder: {
      extension: (ctx) => folderExtension(ctx),
      label: () => t('folder_label'),
      insert: { label: () => t('folder_insert'), title: () => t('folder_insert_title'), icon: 'folder', node: newFolderNode },
      sections: [
        { id: 'source', title: () => t('section_source'), component: FolderSourceSection, modifiedKeys: ['startPath'] },
        {
          id: 'display',
          title: () => t('section_display'),
          component: FolderDisplaySection,
          modifiedKeys: ['density', 'sortKey', 'sortDir', 'showSize', 'showModified', 'allowNavigate', 'pageSize', 'highlightLinked'],
        },
      ],
      placement: 'box',
    },
    nextcloudFile: {
      extension: (ctx) => fileExtension(ctx),
      label: () => t('file_label'),
      insert: { label: () => t('file_insert'), title: () => t('file_insert_title'), icon: 'file', node: newFileNode },
      sections: [
        { id: 'source', title: () => t('section_source'), component: FileSourceSection },
        {
          id: 'display',
          title: () => t('section_display'),
          component: FileDisplaySection,
          modifiedKeys: ['variant', 'titleMode', 'preview', 'showMeta', 'showDownload', 'showNodeLink'],
        },
      ],
      placement: 'box',
    },
  },
});
