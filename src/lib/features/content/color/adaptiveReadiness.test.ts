// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { checkAdaptiveReadiness } from './adaptiveReadiness';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const txt = (text: string, color?: string) => ({ type: 'text', text, ...(color ? { marks: [{ type: 'typographyColor', attrs: { color } }] } : {}) });
const para = (blockId: string, content: unknown[], typography?: unknown) => ({ type: 'paragraph', attrs: { blockId, ...(typography ? { typography } : {}) }, content });

describe('checkAdaptiveReadiness', () => {
  it('finds nothing in a page that uses no literal colours', () => {
    expect(checkAdaptiveReadiness(doc(para('p1', [txt('plain')])))).toEqual([]);
  });

  it("measures against the page's own background when it sets one", () => {
    const plain = checkAdaptiveReadiness(doc(para('p1', [txt('x')], { desktop: { color: '#1e293b' } })));
    const tinted = checkAdaptiveReadiness({ ...doc(para('p1', [txt('x')], { desktop: { color: '#1e293b' } })), attrs: { surface: { desktop: { bg: 'token:subtle' } } } });
    expect(tinted).toHaveLength(1);
    expect('ratio' in tinted[0] && tinted[0].ratio).not.toBe('ratio' in plain[0] && plain[0].ratio);
  });

  it('flags a dark literal text colour on the page ground in the dark scheme only', () => {
    const findings = checkAdaptiveReadiness(doc(para('p1', [txt('x')], { desktop: { color: '#1e293b' } })));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'text', blockId: 'p1', blockType: 'paragraph', color: '#1e293b', scheme: 'dark', minimum: 4.5 });
    // Set on desktop, inherited by tablet and phone.
    expect('ratio' in findings[0] && findings[0].tiers.sort()).toEqual(['desktop', 'phone', 'tablet']);
  });

  it('flags a light literal text colour in the light scheme', () => {
    const findings = checkAdaptiveReadiness(doc(para('p1', [txt('x', '#f8fafc')])));
    expect(findings.map((f) => 'ratio' in f && f.scheme)).toEqual(['light']);
  });

  it('does not flag text inside a block whose background is also a literal (a scheme region)', () => {
    const cell = { type: 'gridCell', attrs: { surface: { desktop: { bg: '#0f172a' } } }, content: [para('p1', [txt('x', '#f8fafc')])] };
    const grid = { type: 'grid', attrs: { blockId: 'g1' }, content: [cell] };
    expect(checkAdaptiveReadiness(doc(grid))).toEqual([]);
  });

  it('checks per tier: a background set only from tablet leaves desktop on the page ground', () => {
    const cell = { type: 'gridCell', attrs: { surface: { tablet: { bg: '#0f172a' } } }, content: [para('p1', [txt('x', '#f8fafc')])] };
    const findings = checkAdaptiveReadiness(doc({ type: 'grid', attrs: { blockId: 'g1' }, content: [cell] }));
    expect(findings).toHaveLength(1);
    expect('ratio' in findings[0] && findings[0].tiers).toEqual(['desktop']);
  });

  it('flags a literal border on the page ground below 3:1', () => {
    const findings = checkAdaptiveReadiness(doc({ type: 'quickLink', attrs: { blockId: 'r1', surface: { desktop: { border: '#e2e8f0' } } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'border', blockId: 'r1', scheme: 'light', minimum: 3 });
  });

  it('composites a translucent colour over the ground before measuring', () => {
    // 20 % black text reads on neither ground.
    const findings = checkAdaptiveReadiness(doc(para('p1', [txt('x', 'rgba(0, 0, 0, 0.2)')])));
    expect(findings.map((f) => 'ratio' in f && f.scheme).sort()).toEqual(['dark', 'light']);
  });

  it('reports a colour repeated across runs once per block and scheme', () => {
    const findings = checkAdaptiveReadiness(doc(para('p1', [txt('a', '#1e293b'), txt('b', '#1e293b')])));
    expect(findings).toHaveLength(1);
  });

  it('flags an HTML block with inline colour styles, and not one without', () => {
    const styled = { type: 'htmlBlock', attrs: { blockId: 'h1', html: '<p style="color: #333">hi</p>' } };
    const plain = { type: 'htmlBlock', attrs: { blockId: 'h2', html: '<p style="margin: 0">hi</p>' } };
    expect(checkAdaptiveReadiness(doc(styled, plain))).toEqual([{ kind: 'html', blockId: 'h1', blockType: 'htmlBlock' }]);
  });

  it('does not flag an HTML block with inline colours that pins the scheme they were picked for', () => {
    const pinned = { type: 'htmlBlock', attrs: { blockId: 'h1', html: '<p style="color: #333">hi</p>', scheme: 'light' } };
    expect(checkAdaptiveReadiness(doc(pinned))).toEqual([]);
  });

  it('does not flag a theme colour on the page ground: both follow the scheme', () => {
    expect(checkAdaptiveReadiness(doc(para('p1', [txt('x', 'token:muted')])))).toEqual([]);
  });

  it("resolves a theme colour inside a scheme region in the region's scheme", () => {
    // The dark card pins dark for its subtree: the theme text colour is the dark scheme's light text in both page schemes.
    const cell = { type: 'gridCell', attrs: { surface: { desktop: { bg: '#0f172a' } } }, content: [para('p1', [txt('x', 'token:text')])] };
    expect(checkAdaptiveReadiness(doc({ type: 'grid', attrs: { blockId: 'g1' }, content: [cell] }))).toEqual([]);
  });

  it('flags a theme text colour on a translucent background whose ground changes with the scheme', () => {
    // 40 % black over each page ground: no scheme region, so the muted text follows the page — and loses contrast on the light composite.
    const cell = { type: 'gridCell', attrs: { blockId: 'c1', surface: { desktop: { bg: 'rgba(0, 0, 0, 0.4)' } } }, content: [para('p1', [txt('x', 'token:muted')])] };
    const findings = checkAdaptiveReadiness(doc({ type: 'grid', attrs: { blockId: 'g1' }, content: [cell] }));
    expect(findings.map((f) => 'ratio' in f && `${f.color} ${f.scheme}`)).toEqual(['token:muted light']);
  });

  it("finds nothing for the default text on a block filled with a theme colour: it takes the fill's readable partner", () => {
    const cell = { type: 'gridCell', attrs: { surface: { desktop: { bg: 'token:inverse' } } }, content: [para('p1', [txt('x')])] };
    expect(checkAdaptiveReadiness(doc({ type: 'grid', attrs: { blockId: 'g1' }, content: [cell] }))).toEqual([]);
  });

  it('does not flag the default text inside a scheme region even where it reads poorly: that pair never changes', () => {
    const cell = { type: 'gridCell', attrs: { surface: { desktop: { bg: '#808080' } } }, content: [para('p1', [txt('x')])] };
    expect(checkAdaptiveReadiness(doc({ type: 'grid', attrs: { blockId: 'g1' }, content: [cell] }))).toEqual([]);
  });

  it("finds nothing on a quick link filled with a theme colour: its text defaults to the fill's partner", () => {
    const ref = { type: 'quickLink', attrs: { blockId: 'r1', surface: { desktop: { bg: 'token:accent' } } } };
    expect(checkAdaptiveReadiness(doc(ref))).toEqual([]);
  });

  it('treats a query block result surface as a ground for its template', () => {
    const qb = {
      type: 'queryBlock',
      attrs: { blockId: 'q1', formatOptions: { surface: { desktop: { bg: '#0f172a' } } } },
      content: [para('p1', [txt('x', '#f8fafc')])],
    };
    expect(checkAdaptiveReadiness(doc(qb))).toEqual([]);
  });
});

describe('checkAdaptiveReadiness on background images', () => {
  const IMG = '11111111-1111-4111-8111-111111111111';
  const section = (blockId: string, surface: Record<string, unknown>, content: unknown[] = []) => ({ type: 'pageSection', attrs: { blockId, surface: { desktop: { image: IMG, ...surface } } }, content });

  it('flags an image with neither an overlay nor a scheme, once, and measures nothing on it', () => {
    const findings = checkAdaptiveReadiness(doc(section('s1', {}, [para('p1', [txt('x', '#1e293b')])])));
    expect(findings).toEqual([{ blockId: 's1', blockType: 'pageSection', kind: 'image-ground' }]);
  });

  it('an overlay or a scheme makes it scheme-invariant: no finding', () => {
    expect(checkAdaptiveReadiness(doc(section('s1', { overlay: '#000000', overlayOpacity: 70 })))).toEqual([]);
    expect(checkAdaptiveReadiness(doc(section('s1', { imageScheme: 'dark' })))).toEqual([]);
  });
});
