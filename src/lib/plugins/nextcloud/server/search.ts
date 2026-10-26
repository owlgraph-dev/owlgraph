// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What search finds the plugin's nodes by beside their titles: the folder or
// file name, the file name without its extension (full-text search reads
// "Report.pdf" as one token), and for a share's node the folders above it. An
// own-files node is found by its name alone: where it lay for them is theirs.
import type { PluginSearchNode } from '$lib/plugins/api';
import { nameOf, parentOf } from '../sharePath';
import { collectionRef, documentRef } from './refs';

const segments = (path: string) => (path === '' ? [] : path.split('/'));

function stem(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : '';
}

export function searchText(node: PluginSearchNode): string {
  let words: string[];
  if (node.type === 'collection') {
    const ref = collectionRef(node.ref);
    words = [ref.name, ...segments(ref.path)];
  } else {
    const ref = documentRef(node.ref);
    const name = node.file?.filename || (ref?.path ? nameOf(ref.path) : '');
    words = [...(ref?.path ? segments(parentOf(ref.path) ?? '') : []), name, stem(name)];
  }
  return [...new Set(words.map((w) => w.trim()).filter(Boolean))].join(' ');
}
