// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { sanitizeSvg, SvgRejectedError } from './svgSanitize.server';

describe('sanitizeSvg', () => {
  it('strips script tags and event handlers', () => {
    const dirty = '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>alert(2)</script><circle r="5"/></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onload');
    expect(clean).toContain('<circle');
  });

  it('strips foreignObject', () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><rect width="1" height="1"/></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('foreignObject');
    expect(clean).toContain('<rect');
  });

  it('strips a DOCTYPE/ENTITY declaration so the entity reference is never resolved (XXE regression)', () => {
    const dirty =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><title>&xxe;</title></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<!DOCTYPE');
    expect(clean).not.toContain('<!ENTITY');
    // Left as inert, escaped text, never resolved to file content.
    expect(clean).toContain('&amp;xxe;');
  });

  it('preserves benign markup', () => {
    const clean = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" fill="#000"/></svg>');
    expect(clean).toContain('<path');
    expect(clean).toContain('viewBox');
    expect(clean).toContain('fill');
  });

  it('throws SvgRejectedError on non-SVG input', () => {
    expect(() => sanitizeSvg('<p>not an svg</p>')).toThrow(SvgRejectedError);
  });

  it('throws SvgRejectedError on empty input', () => {
    expect(() => sanitizeSvg('')).toThrow(SvgRejectedError);
  });
});
