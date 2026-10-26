// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The block's words as one prop (docs/architecture/blocks/anatomy.md, "Svelte leaf blocks"): in the
// page's content language on the page, the interface's in the editor. The
// editor's own words are null on the page.
import { t } from '../../messages';
import type { SourceStatus } from '../../server/refs';

type Problem = Exclude<SourceStatus, 'ok'>;

export interface FileTexts {
  download: string;
  openNode: string;
  unavailable: string;
  /** For a viewer who may connect their account, or connect it again. */
  access: { connectTitle: string; connectBody: string; connectAction: string; renewTitle: string; renewBody: string; renewAction: string };
  documentChip: string;
  genericType: string;
  editor: {
    unconfigured: string;
    reasons: Record<Problem, string>;
    /** "file id {fileid}" */
    fileid: string;
    /** "last seen {date}" */
    lastSeen: string;
    nodeKept: string;
    check: string;
    chooseOther: string;
    checkFailed: string;
    rebindFailed: string;
    browserTitle: string;
    browserDescription: string;
    browserChoose: string;
  } | null;
}

export function fileTexts(forEditor: boolean): FileTexts {
  return {
    download: t('file_download'),
    openNode: t('file_open_node'),
    unavailable: t('file_unavailable'),
    access: {
      connectTitle: t('file_connect_title'),
      connectBody: t('file_connect_body'),
      connectAction: t('connect_action'),
      renewTitle: t('file_renew_title'),
      renewBody: t('file_renew_body'),
      renewAction: t('renew_action'),
    },
    documentChip: t('folder_document'),
    genericType: t('file_type_generic'),
    editor: forEditor
      ? {
          unconfigured: t('file_unconfigured'),
          reasons: {
            notFound: t('file_not_found'),
            unauthorized: t('status_unauthorized'),
            revoked: t('status_revoked'),
            unreachable: t('status_unreachable'),
            disabled: t('status_disabled'),
            unconfigured: t('status_unconfigured'),
            tooLarge: t('status_too_large'),
          },
          fileid: t('file_fileid'),
          lastSeen: t('file_last_seen'),
          nodeKept: t('file_node_kept'),
          check: t('file_check'),
          chooseOther: t('file_choose_other'),
          checkFailed: t('file_check_failed'),
          rebindFailed: t('file_rebind_failed'),
          browserTitle: t('browser_title'),
          browserDescription: t('file_other_desc'),
          browserChoose: t('browser_choose'),
        }
      : null,
  };
}
