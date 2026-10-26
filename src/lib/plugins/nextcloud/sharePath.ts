// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Paths a client may name inside a node's root (a share, or a folder of
// someone's own files): always relative, never an address, and checked before
// the server makes one (server/davRoot.ts), so a request reaches only inside its root.
export const MAX_PATH_LENGTH = 1024;

export type PathProblem = 'absolute' | 'segment' | 'characters' | 'too-long';

const TOKEN = /^[A-Za-z0-9_-]{4,64}$/;

export function isShareToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN.test(token);
}

/**
 * A relative path ('' is the root) in NFC, or why it is refused. A path arrives
 * decoded once, so one still holding `%2f` or `%5c` asks to be decoded twice.
 */
export function checkSharePath(input: unknown): { path: string } | { problem: PathProblem } {
  if (typeof input !== 'string') return { problem: 'characters' };
  if (input.length > MAX_PATH_LENGTH) return { problem: 'too-long' };
  const path = input.normalize('NFC');
  if (path === '') return { path };
  if (path.startsWith('/')) return { problem: 'absolute' };
  if (/[\\\u0000-\u001f\u007f]/.test(path) || /%(?:2f|5c)/i.test(path)) return { problem: 'characters' };
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return { problem: 'segment' };
  return { path };
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** '' for a path at the root, null for the root itself. */
export function parentOf(path: string): string | null {
  if (path === '') return null;
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

export function isWithin(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`);
}

/** Both must be checked paths. */
export function joinPath(folder: string, path: string): string {
  return folder === '' ? path : path === '' ? folder : `${folder}/${path}`;
}

/** Null for a path outside `folder`. */
export function relativeTo(path: string, folder: string): string | null {
  if (folder === '') return path;
  if (path === folder) return '';
  return path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : null;
}
