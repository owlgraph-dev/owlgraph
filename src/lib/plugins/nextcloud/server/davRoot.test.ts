// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { davPath, isUid, pathOfHref, searchScope, SHARE_PREFIX, USER_PREFIX, type DavRoot } from './davRoot';

const TOKEN = 'AbCdEf123456';
const share: DavRoot = { kind: 'share', token: TOKEN };
const alice: DavRoot = { kind: 'user', uid: 'alice' };
const spaced: DavRoot = { kind: 'user', uid: "Ann O'Neil@example.org" };

describe('a WebDAV address', () => {
  it("encodes every segment under a share's root", () => {
    expect(davPath(share, '')).toBe(`${SHARE_PREFIX}${TOKEN}/`);
    expect(davPath(share, 'Q3 #1/Plan?.md')).toBe(`${SHARE_PREFIX}${TOKEN}/Q3%20%231/Plan%3F.md`);
    expect(davPath(share, 'März/ü.pdf')).toBe(`${SHARE_PREFIX}${TOKEN}/M%C3%A4rz/%C3%BC.pdf`);
  });

  it("encodes the user id and every segment under a person's own root", () => {
    expect(davPath(alice, '')).toBe(`${USER_PREFIX}alice/`);
    expect(davPath(alice, 'Projekte/Team')).toBe(`${USER_PREFIX}alice/Projekte/Team`);
    expect(davPath(spaced, 'a.txt')).toBe(`${USER_PREFIX}Ann%20O'Neil%40example.org/a.txt`);
    expect(searchScope('alice')).toBe('/files/alice');
    expect(searchScope('Ann O')).toBe('/files/Ann%20O');
  });

  it('refuses a token, a user id or a path that was not checked', () => {
    expect(() => davPath({ kind: 'share', token: '../x' }, 'a')).toThrow();
    expect(() => davPath({ kind: 'share', token: 'ab' }, 'a')).toThrow();
    expect(() => davPath({ kind: 'share', token: `${TOKEN}/other` }, 'a')).toThrow();
    expect(() => davPath(share, '../a')).toThrow();
    for (const uid of ['', 'a/b', '.', '..', 'x'.repeat(65), 'a\\b', 'a%2fb', 'tab\tbed']) {
      expect(() => davPath({ kind: 'user', uid }, 'a'), uid).toThrow();
      expect(isUid(uid), uid).toBe(false);
    }
    expect(() => davPath(alice, 'a/../b')).toThrow();
  });
});

describe("an answer's href", () => {
  it('names a path inside the share', () => {
    expect(pathOfHref(`${SHARE_PREFIX}${TOKEN}/`, share)).toBe('');
    expect(pathOfHref(`${SHARE_PREFIX}${TOKEN}`, share)).toBe('');
    expect(pathOfHref(`${SHARE_PREFIX}${TOKEN}/Q3%20%231/`, share)).toBe('Q3 #1');
    expect(pathOfHref(`${SHARE_PREFIX}${TOKEN}/M%C3%A4rz/%C3%BC.pdf`, share)).toBe('März/ü.pdf');
    expect(pathOfHref(`https://cloud.example.org${SHARE_PREFIX}${TOKEN}/a.pdf`, share)).toBe('a.pdf');
  });

  it("names a path inside a person's own files, their id compared decoded", () => {
    expect(pathOfHref(`${USER_PREFIX}alice/`, alice)).toBe('');
    expect(pathOfHref(`${USER_PREFIX}alice`, alice)).toBe('');
    expect(pathOfHref(`${USER_PREFIX}alice/Projekte/Team%20(Alice)/a.txt`, alice)).toBe('Projekte/Team (Alice)/a.txt');
    expect(pathOfHref(`${USER_PREFIX}Ann%20O'Neil%40example.org/a.txt`, spaced)).toBe('a.txt');
    expect(pathOfHref(`${USER_PREFIX}Ann%20O%27Neil%40example.org/a.txt`, spaced)).toBe('a.txt');
  });

  it('is dropped when it lies outside the root it was asked of', () => {
    for (const href of [
      `${SHARE_PREFIX}otherToken/a.pdf`,
      `${SHARE_PREFIX}${TOKEN}x/a.pdf`,
      `${USER_PREFIX}admin/a.pdf`,
      `${SHARE_PREFIX}${TOKEN}/../otherToken/a.pdf`,
      `${SHARE_PREFIX}${TOKEN}/a%2Fb.pdf`,
      `${SHARE_PREFIX}${TOKEN}/%E0%A4%A`,
      'not a path',
    ]) {
      expect(pathOfHref(href, share), href).toBeNull();
    }
    for (const href of [
      `${USER_PREFIX}bob/a.txt`,
      `${USER_PREFIX}alicex/a.txt`,
      `${USER_PREFIX}ALICE/a.txt`,
      `${SHARE_PREFIX}${TOKEN}/a.txt`,
      `${USER_PREFIX}alice/../bob/a.txt`,
      `${USER_PREFIX}alice/a%2F..%2Fb`,
      '/remote.php/dav/trashbin/alice/a.txt',
    ]) {
      expect(pathOfHref(href, alice), href).toBeNull();
    }
  });
});
