// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor's store of the documents its file blocks show: one entry per
// document, shared by every block and block settings panel showing it, so a check or
// rebind in one place shows in all. Dropped once nothing shows it.
import type { DocumentView } from '../../server/documents.server';
import { PLUGIN_ROUTES } from '../routes';
import type { TreeChoice } from '../tree';

type Listener = (view: DocumentView | null) => void;

interface Entry {
  /** Undefined until the plugin answered. */
  view: DocumentView | null | undefined;
  listeners: Set<Listener>;
  asking: boolean;
}

const entries = new Map<string, Entry>();

// Long enough for a block just made to start showing what was just made for it.
const DROP_AFTER_MS = 5000;

function entryOf(id: string): Entry {
  let entry = entries.get(id);
  if (!entry) {
    entry = { view: undefined, listeners: new Set(), asking: false };
    entries.set(id, entry);
  }
  return entry;
}

function dropUnshown(id: string, entry: Entry): void {
  setTimeout(() => {
    if (entry.listeners.size === 0 && !entry.asking && entries.get(id) === entry) entries.delete(id);
  }, DROP_AFTER_MS);
}

function publish(id: string, view: DocumentView | null): void {
  const entry = entryOf(id);
  entry.view = view;
  for (const listener of entry.listeners) listener(view);
  if (entry.listeners.size === 0) dropUnshown(id, entry);
}

type Answer = { status: number; view: DocumentView | null };

async function ask(path: string, write?: { method: 'POST' | 'PATCH'; body: unknown }): Promise<Answer | null> {
  try {
    const res = await fetch(`${PLUGIN_ROUTES}/${path}`, {
      method: write?.method ?? 'GET',
      headers: write ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
      ...(write ? { body: JSON.stringify(write.body) } : {}),
    });
    if (!res.ok) return { status: res.status, view: null };
    return { status: res.status, view: ((await res.json()) as { document?: DocumentView | null }).document ?? null };
  } catch {
    return null;
  }
}

/** Looks the file up again, or, where the editor may not write the document, reads its record. True when looked up. */
async function checkDocument(id: string): Promise<boolean> {
  // Where a "connect your account" link brings the editor back to.
  const here = new URLSearchParams({ r: `${window.location.pathname}${window.location.search}` });
  const checked = await ask(`documents/${id}/check?${here}`, { method: 'POST', body: {} });
  if (checked && (checked.status === 200 || checked.status === 404)) {
    publish(id, checked.view);
    return checked.status === 200;
  }
  const read = await ask(`documents/${id}`);
  if (read && (read.status === 200 || read.status === 404)) publish(id, read.view);
  // Nothing to be had: the neutral state, not a skeleton for ever.
  else if (entryOf(id).view === undefined) publish(id, null);
  return false;
}

/** Binds the document to another file, keeping its node and edges. */
export async function rebindDocument(id: string, choice: TreeChoice): Promise<boolean> {
  const file = { path: choice.path, fileid: choice.fileid };
  const answer = await ask(`documents/${id}`, { method: 'PATCH', body: choice.kind === 'own' ? { own: file } : file });
  if (answer?.status !== 200 || !answer.view) return false;
  publish(id, answer.view);
  return true;
}

/** Makes, or finds, the chosen file's document: the collection's, or beside the page for the editor's own file. */
export async function createDocument(choice: TreeChoice, pageId: string | null): Promise<DocumentView | null> {
  if (choice.kind === 'own' && !pageId) return null;
  const file = { path: choice.path, fileid: choice.fileid };
  const body = choice.kind === 'own' ? { besidePageId: pageId, own: file } : { collectionId: choice.collectionId, ...file };
  const answer = await ask('documents', { method: 'POST', body });
  if (!answer || (answer.status !== 200 && answer.status !== 201) || !answer.view) return null;
  publish(answer.view.id, answer.view);
  return answer.view;
}

/** The first to follow a document asks the plugin. */
export function watchDocument(id: string, listener: Listener): () => void {
  const entry = entryOf(id);
  entry.listeners.add(listener);
  if (entry.view !== undefined) listener(entry.view);
  else if (!entry.asking) {
    entry.asking = true;
    void checkDocument(id).finally(() => {
      entry.asking = false;
    });
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) dropUnshown(id, entry);
  };
}

export function documentEditing(id: string) {
  return {
    watch: (listener: Listener) => watchDocument(id, listener),
    check: () => checkDocument(id),
    rebind: (choice: TreeChoice) => rebindDocument(id, choice),
  };
}
