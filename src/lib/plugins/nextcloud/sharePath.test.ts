// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { checkSharePath, isShareToken, isWithin, joinPath, nameOf, parentOf, relativeTo, MAX_PATH_LENGTH } from './sharePath';

const TOKEN = 'Abc123xYz_-q';

describe('a path inside a share', () => {
  it('is relative to the share root, the root itself empty', () => {
    expect(checkSharePath('')).toEqual({ path: '' });
    expect(checkSharePath('Reports')).toEqual({ path: 'Reports' });
    expect(checkSharePath('Reports/2026 Q3/Plan.md')).toEqual({ path: 'Reports/2026 Q3/Plan.md' });
  });

  it('refuses an absolute path', () => {
    expect(checkSharePath('/Reports')).toEqual({ problem: 'absolute' });
    expect(checkSharePath('//other/share')).toEqual({ problem: 'absolute' });
  });

  it('refuses a step up, a step nowhere and an empty segment', () => {
    for (const path of ['..', '../x', 'a/../b', 'a/..', '.', './a', 'a/./b', 'a//b', 'a/', 'a/b/']) {
      expect(checkSharePath(path), path).toEqual({ problem: 'segment' });
    }
  });

  it('refuses a backslash, a control character and an encoded separator', () => {
    for (const path of ['a\\b', '..\\x', 'a\u0000b', 'a\nb', 'a\u007fb', 'a%2fb', 'a%2Fb', 'x%2fsecret', 'a%5cb', 'a%5Cb']) {
      expect(checkSharePath(path), JSON.stringify(path)).toEqual({ problem: 'characters' });
    }
  });

  it('refuses what is not a string, and one past the length limit', () => {
    for (const value of [null, undefined, 42, ['a'], { path: 'a' }]) expect(checkSharePath(value)).toEqual({ problem: 'characters' });
    expect(checkSharePath('a'.repeat(MAX_PATH_LENGTH + 1))).toEqual({ problem: 'too-long' });
    expect(checkSharePath('a'.repeat(MAX_PATH_LENGTH))).toEqual({ path: 'a'.repeat(MAX_PATH_LENGTH) });
  });

  it('is normalized to NFC, so one name is one path however it was typed', () => {
    const decomposed = 'März.pdf';
    expect(checkSharePath(decomposed)).toEqual({ path: 'März.pdf' });
  });

  it('knows its name, its folder and what it is within', () => {
    expect(nameOf('Reports/2026/Plan.md')).toBe('Plan.md');
    expect(nameOf('')).toBe('');
    expect(parentOf('Reports/2026/Plan.md')).toBe('Reports/2026');
    expect(parentOf('Plan.md')).toBe('');
    expect(parentOf('')).toBeNull();
    expect(isWithin('Reports/2026', 'Reports')).toBe(true);
    expect(isWithin('Reports2', 'Reports')).toBe(false);
    expect(isWithin('anything', '')).toBe(true);
  });
});

describe('a share token', () => {
  it('takes a share token of letters, digits, _ and -, 4 to 64 long', () => {
    expect(isShareToken('aBc9')).toBe(true);
    expect(isShareToken('x'.repeat(64))).toBe(true);
    for (const token of ['abc', 'x'.repeat(65), 'a/b4', 'a%2fb', 'äbcd', '', null]) expect(isShareToken(token), String(token)).toBe(false);
  });
});

describe('paths below a folder', () => {
  it('joins a folder and a path inside it', () => {
    expect(joinPath('', 'a/b')).toBe('a/b');
    expect(joinPath('Team', '')).toBe('Team');
    expect(joinPath('Projekte/Team', 'Q3/Plan.md')).toBe('Projekte/Team/Q3/Plan.md');
  });

  it('reads a path relative to a folder, and nothing outside it', () => {
    expect(relativeTo('Projekte/Team/Q3', 'Projekte/Team')).toBe('Q3');
    expect(relativeTo('Projekte/Team', 'Projekte/Team')).toBe('');
    expect(relativeTo('a', '')).toBe('a');
    expect(relativeTo('Projekte/Teams/x', 'Projekte/Team')).toBeNull();
    expect(relativeTo('Projekte', 'Projekte/Team')).toBeNull();
  });
});
