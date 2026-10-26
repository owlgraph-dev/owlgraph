// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Nextcloud plugin's manifest (docs/architecture/nextcloud.md):
// what every surface knows about it.
import { definePlugin } from '$lib/plugins/api';
import { t } from './messages';
import { folderKind } from './blocks/folder/model';
import { fileKind } from './blocks/file/model';

export const nextcloud = definePlugin({
  id: 'nextcloud',
  label: () => t('plugin_label'),
  blocks: [folderKind, fileKind],
  settings: {
    intro: () => t('settings_intro'),
    fields: [
      { key: 'origin', kind: 'origin', label: () => t('settings_origin_label'), description: () => t('settings_origin_desc') },
      {
        key: 'cacheSeconds',
        kind: 'number',
        label: () => t('settings_cache_label'),
        description: () => t('settings_cache_desc'),
        unit: () => t('settings_cache_unit'),
        min: 0,
        max: 3600,
        default: 60,
      },
    ],
  },
  connections: {
    kinds: ['app_password'],
    intro: () => t('connections_intro'),
  },
  sources: {
    collection: {
      fields: [
        { key: 'shareUrl', kind: 'url', label: () => t('connect_url_label'), description: () => t('connect_url_desc'), required: true },
        { key: 'password', kind: 'password', label: () => t('connect_password_label'), description: () => t('connect_password_desc'), required: false },
      ],
    },
  },
});
