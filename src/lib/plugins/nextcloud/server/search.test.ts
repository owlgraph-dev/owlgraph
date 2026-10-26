// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { searchText } from './search';

const file = (filename: string) => ({ filename, mime: null, size: null });

describe('what search finds a share’s nodes by', () => {
  it('finds a collection by its share’s name and the folders down to it', () => {
    expect(searchText({ type: 'collection', title: 'Unterlagen', ref: { path: '', name: 'Projektunterlagen' }, file: null })).toBe('Projektunterlagen');
    expect(searchText({ type: 'collection', title: 'Archiv', ref: { path: 'Archiv/2025', name: 'Projektunterlagen' }, file: null })).toBe(
      'Projektunterlagen Archiv 2025'
    );
  });

  it('finds a document by its folders, its file’s name and that name without its extension', () => {
    const ref = { path: '2026 Q3/Bericht.pdf', fileid: '48213', status: 'ok' };
    expect(searchText({ type: 'document', title: 'Quartalsbericht', ref, file: file('Bericht.pdf') })).toBe('2026 Q3 Bericht.pdf Bericht');
    // The file as last reported names it, whatever the record's path still says.
    expect(searchText({ type: 'document', title: 'Quartalsbericht', ref, file: file('Bericht-final.pdf') })).toBe('2026 Q3 Bericht-final.pdf Bericht-final');
    expect(searchText({ type: 'document', title: 'Notizen', ref: { path: 'Notizen', fileid: '7' }, file: file('Notizen') })).toBe('Notizen');
  });

  it('says nothing more than the record’s names — no other field of it, nothing of a record that names no file', () => {
    const said = searchText({ type: 'collection', title: 'x', ref: { path: '', name: 'Akten', token: 'SecretShareToken42', password: 'pw' }, file: null });
    expect(said).toBe('Akten');
    expect(searchText({ type: 'document', title: 'x', ref: {}, file: null })).toBe('');
    expect(searchText({ type: 'document', title: 'x', ref: { path: '../etc', fileid: '1' }, file: null })).toBe('');
  });
});

describe('what search finds a node picked from someone’s own files by', () => {
  it('finds it by its name alone — never by where it lay for whoever picked it', () => {
    const doc = { fileid: '501', pathHint: 'Privat/Steuer 2026/Bescheid.pdf', hintUid: 'alice', status: 'ok' };
    expect(searchText({ type: 'document', title: 'Bescheid', ref: doc, file: file('Bescheid.pdf') })).toBe('Bescheid.pdf Bescheid');
    const folder = { path: '', name: 'Team', fileid: '500', pathHint: 'Projekte/Geheim/Team', hintUid: 'alice' };
    expect(searchText({ type: 'collection', title: 'Team', ref: folder, file: null })).toBe('Team');
  });
});
