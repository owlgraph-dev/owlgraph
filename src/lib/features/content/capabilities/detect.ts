// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Read from the marker each node declares in its own addStorage, not from data
// presence (a block may support a capability with no value set) and not from a
// list kept elsewhere, which drifts.
import type { Editor } from '@tiptap/core';

export function blockSupportsCapability(editor: Editor, blockType: string, capability: string): boolean {
  const ext = editor.extensionManager.extensions.find((e) => e.name === blockType);
  const capabilities = (ext?.storage as { capabilities?: string[] } | undefined)?.capabilities;
  return !!capabilities?.includes(capability);
}
