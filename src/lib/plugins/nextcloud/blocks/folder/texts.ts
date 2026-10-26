// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The block's words as one prop, so its props stay plain JSON (docs/architecture/blocks/anatomy.md,
// "Svelte leaf blocks"): in the page's content language on the page, the
// interface's in the editor. The editor's own words are null on the page.
import { t } from '../../messages';
import type { SourceStatus } from '../../server/refs';

type Problem = Exclude<SourceStatus, 'ok'>;

export interface FolderTexts {
  columns: { name: string; size: string; modified: string };
  sortKeys: { name: string; modified: string; size: string };
  sortDirs: { asc: string; desc: string };
  /** "Sorted by {key}, {dir}". */
  sortButton: string;
  sortTitle: string;
  apply: string;
  cancel: string;
  refresh: string;
  back: string;
  breadcrumb: string;
  loadMore: string;
  /** "{shown} of {total}". */
  count: string;
  source: string;
  stale: string;
  loading: string;
  empty: string;
  unavailableTitle: string;
  unavailableBody: string;
  /** For a viewer who may connect their account, or connect it again. */
  access: { connectTitle: string; connectBody: string; connectAction: string; renewTitle: string; renewBody: string; renewAction: string };
  documentChip: string;
  /** "Open document {name}". */
  openDocument: string;
  /** "Download {name}". */
  download: string;
  editor: {
    unconfigured: string;
    createDocument: string;
    createFailed: string;
    repair: string;
    /** "{count} entries, {date}. …" */
    lastKnown: string;
    reasons: Record<Problem, string>;
  } | null;
}

export function folderTexts(forEditor: boolean): FolderTexts {
  return {
    columns: { name: t('folder_col_name'), size: t('folder_col_size'), modified: t('folder_col_modified') },
    sortKeys: { name: t('folder_col_name'), modified: t('folder_col_modified'), size: t('folder_col_size') },
    sortDirs: { asc: t('folder_sort_asc'), desc: t('folder_sort_desc') },
    sortButton: t('folder_sort_button'),
    sortTitle: t('folder_sort_title'),
    apply: t('folder_sort_apply'),
    cancel: t('folder_sort_cancel'),
    refresh: t('folder_refresh'),
    back: t('folder_back'),
    breadcrumb: t('folder_breadcrumb'),
    loadMore: t('folder_load_more'),
    count: t('folder_count'),
    source: t('plugin_label'),
    stale: t('folder_stale'),
    loading: t('folder_loading'),
    empty: t('folder_empty'),
    unavailableTitle: t('folder_unavailable_title'),
    unavailableBody: t('folder_unavailable_body'),
    access: {
      connectTitle: t('folder_connect_title'),
      connectBody: t('folder_connect_body'),
      connectAction: t('connect_action'),
      renewTitle: t('folder_renew_title'),
      renewBody: t('folder_renew_body'),
      renewAction: t('renew_action'),
    },
    documentChip: t('folder_document'),
    openDocument: t('folder_open_document'),
    download: t('folder_download'),
    editor: forEditor
      ? {
          unconfigured: t('folder_unconfigured'),
          createDocument: t('folder_create_document'),
          createFailed: t('folder_create_failed'),
          repair: t('folder_repair'),
          lastKnown: t('folder_last_known'),
          reasons: {
            unauthorized: t('status_unauthorized'),
            revoked: t('status_revoked'),
            notFound: t('status_not_found'),
            unreachable: t('status_unreachable'),
            disabled: t('status_disabled'),
            unconfigured: t('status_unconfigured'),
            tooLarge: t('status_too_large'),
          },
        }
      : null,
  };
}
