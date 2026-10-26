// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { PluginSettingsSection } from '$lib/plugins/api';
import { defaultSettings, originOf, storedSettings, validateSettings } from './settingsFields.server';

// A fake plugin's section: one origin, one number.
const section: PluginSettingsSection = {
  intro: () => 'A fake service.',
  fields: [
    { key: 'origin', kind: 'origin', label: () => 'Address' },
    { key: 'ttl', kind: 'number', label: () => 'Cache', min: 0, max: 600, default: 60 },
  ],
};
const opts = { allowLoopbackHttp: false, secretKeyConfigured: true };

describe("a plugin's settings fields", () => {
  it('start off, every origin unset and every number its default', () => {
    expect(defaultSettings(section)).toEqual({ enabled: false, values: { origin: null, ttl: 60 } });
  });

  it('normalize an origin and parse a number', () => {
    const { settings, problems } = validateSettings(section, { enabled: true, values: { origin: ' https://Cloud.Example.org/ ', ttl: '120' } }, opts);
    expect(problems).toEqual({});
    expect(settings).toEqual({ enabled: true, values: { origin: 'https://cloud.example.org', ttl: 120 } });
  });

  it('refuse an address that is not a bare https origin', () => {
    const cases: [string, string][] = [
      ['cloud.example.org', 'origin-invalid'],
      ['https://cloud.example.org/s/AbC123', 'origin-invalid'],
      ['https://cloud.example.org/?q=1', 'origin-invalid'],
      ['https://user:secret@cloud.example.org', 'origin-invalid'],
      ['ftp://cloud.example.org', 'origin-invalid'],
      ['javascript:alert(1)', 'origin-invalid'],
      ['http://cloud.example.org', 'origin-insecure'],
    ];
    for (const [text, problem] of cases) {
      expect(validateSettings(section, { enabled: false, values: { origin: text, ttl: '' } }, opts).problems.origin, text).toBe(problem);
    }
  });

  it('allow plain http to this machine only where the deployment allows it', () => {
    const input = { enabled: false, values: { origin: 'http://127.0.0.1:8080', ttl: '' } };
    expect(validateSettings(section, input, opts).problems.origin).toBe('origin-insecure');
    const allowed = validateSettings(section, input, { ...opts, allowLoopbackHttp: true });
    expect(allowed.problems).toEqual({});
    expect(allowed.settings.values.origin).toBe('http://127.0.0.1:8080');
    expect(validateSettings(section, { ...input, values: { origin: 'http://10.0.0.5', ttl: '' } }, { ...opts, allowLoopbackHttp: true }).problems.origin).toBe('origin-insecure');
  });

  it('need the address, and a secret key, to turn it on — not to keep it off', () => {
    expect(validateSettings(section, { enabled: true, values: { origin: '', ttl: '' } }, opts).problems).toEqual({ origin: 'required' });
    const off = validateSettings(section, { enabled: false, values: { origin: '', ttl: '' } }, opts);
    expect(off.problems).toEqual({});
    expect(off.settings.values.origin).toBeNull();
    const noKey = validateSettings(section, { enabled: true, values: { origin: 'https://cloud.example.org', ttl: '' } }, { ...opts, secretKeyConfigured: false });
    expect(noKey.problems).toEqual({ enabled: 'no-secret-key' });
    expect(validateSettings(section, { enabled: false, values: { origin: '', ttl: '' } }, { ...opts, secretKeyConfigured: false }).problems).toEqual({});
  });

  it('refuse a number that is not whole or out of its range; an empty one is its default', () => {
    const ttl = (text: string) => validateSettings(section, { enabled: false, values: { origin: '', ttl: text } }, opts);
    expect(ttl('').settings.values.ttl).toBe(60);
    expect(ttl('1.5').problems.ttl).toBe('not-a-number');
    expect(ttl('ten').problems.ttl).toBe('not-a-number');
    expect(ttl('601').problems.ttl).toBe('out-of-range');
    expect(ttl('-1').problems.ttl).toBe('out-of-range');
    expect(ttl('0').settings.values.ttl).toBe(0);
  });

  it('read what is stored leniently: what no longer fits is its default, what no field declares is gone', () => {
    const lenient = { allowLoopbackHttp: false };
    expect(storedSettings(section, { enabled: true, values: { origin: 'https://a.example', ttl: 9999, extra: 'x' } }, lenient)).toEqual({
      enabled: true,
      values: { origin: 'https://a.example', ttl: 60 },
    });
    expect(storedSettings(section, 'garbage', lenient)).toEqual(defaultSettings(section));
    expect(storedSettings(section, null, lenient)).toEqual(defaultSettings(section));
    // Only `true` turns it on; a loopback origin once the deployment no longer allows it is unset.
    expect(storedSettings(section, { enabled: 'yes', values: { origin: 'http://127.0.0.1:1' } }, lenient)).toEqual({
      enabled: false,
      values: { origin: null, ttl: 60 },
    });
  });

  it('name the origin a plugin points at', () => {
    expect(originOf(section, { enabled: true, values: { origin: 'https://a.example', ttl: 60 } })).toBe('https://a.example');
    expect(originOf(section, defaultSettings(section))).toBeNull();
    expect(originOf(undefined, { enabled: true, values: {} })).toBeNull();
  });
});
