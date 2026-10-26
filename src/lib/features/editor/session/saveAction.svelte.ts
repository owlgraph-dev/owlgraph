// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Save button: whether a save runs, when the last one landed, and the
// toast a failed one leaves. The editor saves only on demand.
import { toast } from '$lib/design-system';
import { formatTime } from '$lib/platform/i18n/format';
import * as m from '$lib/paraglide/messages';
import type { EditorCore } from '../core/editorCore.svelte';
import type { PageEditorProps } from '../meta/nodeMeta';

export class SaveAction {
  saving = $state(false);
  savedAt = $state<string | null>(null);
  #core: EditorCore;
  #onSave: PageEditorProps['onSave'];
  #failedToast = 0;

  constructor(core: EditorCore, onSave: PageEditorProps['onSave']) {
    this.#core = core;
    this.#onSave = onSave;
  }

  run = async () => {
    const core = this.#core;
    if (!core.editor) return;
    this.saving = true;
    const json = core.docJSON();
    const result = await this.#onSave(json, { acknowledgeDropped: core.removedUnknown(json) });
    if (!result || result.ok !== false) core.markSaved(json);
    this.saving = false;
    if (!result || result.ok !== false) {
      this.savedAt = formatTime(new Date());
      toast.dismiss(this.#failedToast);
    } else if (result.unknownDropped) {
      // The page holds blocks this editor never showed: no retry, the same
      // document is refused again.
      toast.dismiss(this.#failedToast);
      this.#failedToast = toast.error(m.editor_save_unknown_dropped());
    } else if (!result.lockLost) {
      // A toast kept until dismissed, as the author may have moved on, whose
      // retry saves what the editor holds then. A lost lock is the lock-lost
      // banner's to report.
      this.#failedToast = toast.error(m.editor_save_failed(), { action: { label: m.editor_save_retry(), onClick: this.run } });
    }
  };
}
