// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A collection's members as listing rows, the same on the collection's page
// and in a collection block. A labelled member goes by its label, its title below.
import { NODE_TYPE_GLYPH, type NodeType } from '$lib/features/nodes';
import type { EntryRow } from './types';

/** A member as a listing shows it. */
export interface MemberEntry {
  id: string;
  type: NodeType;
  title: string;
  href: string;
  /** What the collection calls it, in the language drawn in — or null. */
  label: string | null;
  /** The name of the integration a mirrored member comes from, or null. */
  source: string | null;
}

export interface MemberTexts {
  types: Readonly<Record<NodeType, string>>;
  /** A mirrored member's kind: its type and where it comes from ("Document · <integration>"). */
  kind(type: string, source: string): string;
}

/** The rows for the members, in their order: each a link to the member's own page — or, `link` false (the editor), no link. */
export function memberRows(members: readonly MemberEntry[], texts: MemberTexts, opts: { link?: boolean } = {}): EntryRow[] {
  return members.map((member) => {
    const type = texts.types[member.type];
    const kind = member.source ? texts.kind(type, member.source) : type;
    return {
      key: member.id,
      name: member.label ?? member.title,
      note: member.label ? member.title : null,
      glyph: NODE_TYPE_GLYPH[member.type],
      folder: member.type === 'collection',
      chip: null,
      meta: kind,
      kind,
      target: opts.link === false ? { kind: 'static' } : { kind: 'link', href: member.href },
    };
  });
}
