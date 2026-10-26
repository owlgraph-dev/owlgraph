// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { checkedAction } from './nodeView.server';

const SERVICE = 'https://cloud.example.org';
const action = (href: string, label = 'Open') => ({ id: 'open', label, href, external: false });

describe("a node page header's actions", () => {
  it('keeps a path on this app, and an address at the service', () => {
    expect(checkedAction(action('/settings/connections'), SERVICE)).toEqual({ id: 'open', label: 'Open', href: '/settings/connections', external: false });
    expect(checkedAction(action(`${SERVICE}/index.php/f/500`), SERVICE)).toEqual({ id: 'open', label: 'Open', href: `${SERVICE}/index.php/f/500`, external: true });
  });

  it('drops anything else: another service, another scheme, an address that leaves the app, credentials, no words', () => {
    for (const href of [
      'https://elsewhere.example.org/f/500',
      'http://cloud.example.org/f/500',
      'https://cloud.example.org.evil.example/f/500',
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example/x',
      '/\\evil.example',
      'https://user:pass@cloud.example.org/',
      'relative/path',
      '',
    ])
      expect(checkedAction(action(href), SERVICE), href).toBeNull();
    expect(checkedAction(action('/fine', '  '), SERVICE)).toBeNull();
    // A plugin turned off has no service to link to.
    expect(checkedAction(action(`${SERVICE}/index.php/f/500`), null)).toBeNull();
  });
});
