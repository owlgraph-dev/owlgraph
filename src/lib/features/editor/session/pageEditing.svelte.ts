// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What both page shells set up: the editor core, the mirror of the page's
// metadata, the Save button's behaviour and the lock-lost report.
import { createEditorCore, type EditorCore, type MountOptions } from '../core/editorCore.svelte';
import { MetaMirror } from '../meta/metaMirror.svelte';
import type { PageEditorProps } from '../meta/nodeMeta';
import { SaveAction } from './saveAction.svelte';

export interface PageEditing {
  core: EditorCore;
  meta: MetaMirror;
  save: SaveAction;
  /** Mounts the editor into the canvas, on the shell's mount. */
  mount: (element: HTMLElement) => void;
}

export function createPageEditing(page: {
  /** The page's metadata as loaded, read once. */
  seed: ConstructorParameters<typeof MetaMirror>[0];
  writes: ConstructorParameters<typeof MetaMirror>[1];
  onSave: PageEditorProps['onSave'];
  /** Read when the editor mounts. */
  mountOptions: () => MountOptions;
}): PageEditing {
  const core = createEditorCore();
  return {
    core,
    meta: new MetaMirror(page.seed, page.writes),
    save: new SaveAction(core, page.onSave),
    mount: (element) => core.mount(element, page.mountOptions()),
  };
}

/**
 * A lost edit lock makes the editor read-only, the content still on screen,
 * and hands the document up once, as a draft to reconcile. An effect of its
 * own, registered where a shell calls this during its init.
 */
export function reportLockLost(core: EditorCore, lockLost: () => boolean, onLockLost: NonNullable<PageEditorProps['onLockLost']>): void {
  let lostReported = false;
  $effect(() => {
    core.editor?.setEditable(!lockLost());
    if (lockLost() && core.editor && !lostReported) {
      lostReported = true;
      onLockLost(core.docJSON(), core.isDirty(), core.heldJSON);
    }
  });
}
