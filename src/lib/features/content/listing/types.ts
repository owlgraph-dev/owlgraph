// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a listing draws (docs/architecture/blocks/anatomy.md, "Shared listings"). Plain
// data: the words, the order and where an entry leads are the caller's.

/** What following an entry does: open it in place (a button), go to an address (a link), or nothing. */
export type EntryTarget =
  | { kind: 'open'; open: () => void }
  | { kind: 'link'; href: string; target?: string; rel?: string; download?: string }
  | { kind: 'static' };

export interface EntryRow {
  /** Unique within the listing. */
  key: string;
  name: string;
  /** Its glyph: one of the design system's. */
  glyph: string;
  /** Drawn as a folder: its glyph in the accent colour. */
  folder: boolean;
  /** A chip after its name: a glyph and a word. */
  chip: { glyph: string; label: string } | null;
  /** A line under its name — the entry's own title, where the listing calls it otherwise. */
  note?: string | null;
  /** Its second line where the columns fold away (a phone): its size and date, say. */
  meta: string;
  /** Its columns, those the listing has. */
  size?: string;
  modified?: string;
  kind?: string;
  target: EntryTarget;
}

/** A document entry's file, as it is drawn (DocumentEntry.svelte): every word and address written by whoever shows it. */
export interface DocumentEntryFile {
  title: string;
  /** Its glyph: a row's icon, a card's tile. */
  glyph: string;
  /** A card's preview: the image's address, the file's type as a tile, or none. */
  preview: { image: string } | { tile: string } | null;
  /** The chip after its title (the editor's "Document"), or null. */
  chip: string | null;
  /** Its details line ("PDF · 1.2 MB · Oct 2, 2026"), '' for none. */
  facts: string;
  /** Where it is, after its details: a glyph and the place, or null. */
  location: { glyph: string; text: string } | null;
  /** The entry is one link to the file — or, null, no link (the editor). */
  link: { href: string; target?: string; rel?: string; download?: string } | null;
  /** The way to its node, as a control. */
  nodeLink: { label: string; href: string } | null;
  /** Its download, as a control: the address and the file name it saves as. */
  download: { label: string; href: string; filename: string } | null;
  /** Where its controls' links open (the editor opens them beside it). */
  linkTarget?: string;
}

/** What a document entry shows instead of its file. */
export interface DocumentPlaceholder {
  glyph: string;
  /** The glyph in a warning's colour rather than muted. */
  tone?: 'warning';
  /** An editor's placeholder: why there is nothing, and the way to repair it. */
  editor?: boolean;
  /** Announced as a status when it appears. */
  status: boolean;
  title?: string;
  /** The file's name, under the title. */
  name?: string;
  body?: string;
  /** A link to act on it — `reload`: a full navigation, past the app's router. */
  action?: { label: string; href: string; target?: string; reload?: boolean };
}

/** What a listing shows instead of its rows. */
export interface EntryPlaceholder {
  glyph: string;
  /** The glyph in a warning's colour rather than muted. */
  tone?: 'warning';
  /** An editor's placeholder: why there is nothing, and the way to repair it. */
  editor?: boolean;
  /** Announced as a status when it appears. */
  status: boolean;
  title?: string;
  body?: string;
  /** A link to act on it — `reload`: a full navigation, past the app's router. */
  action?: { label: string; href: string; target?: string; rel?: string; reload?: boolean };
}
