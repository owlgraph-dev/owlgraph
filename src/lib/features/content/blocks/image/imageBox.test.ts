// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { styleAttr } from '../../capabilities/overrides';
import {
  normalizeBoxMode,
  normalizeBoxHeight,
  normalizeAspect,
  normalizeFit,
  normalizePosition,
  effectiveFit,
  effectivePosition,
  boxImgOverrides,
  boxDataAttr,
  positionDataAttr,
  parseBoxHeight,
  parseBoxAspect,
} from './imageBox';

const style = (props: Record<string, string>) =>
  ({
    height: props.height ?? '',
    getPropertyValue: (p: string) => props[p] ?? '',
  }) as unknown as CSSStyleDeclaration;

describe('imageBox', () => {
  describe('normalizeBoxMode', () => {
    it('accepts the three fitted-box modes, everything else falls back to auto', () => {
      expect(normalizeBoxMode('height')).toBe('height');
      expect(normalizeBoxMode('aspect')).toBe('aspect');
      expect(normalizeBoxMode('fill')).toBe('fill');
      expect(normalizeBoxMode('auto')).toBe('auto');
      expect(normalizeBoxMode(null)).toBe('auto');
      expect(normalizeBoxMode(undefined)).toBe('auto');
      expect(normalizeBoxMode('bogus')).toBe('auto');
      expect(normalizeBoxMode(42)).toBe('auto');
    });
  });

  describe('normalizeBoxHeight', () => {
    it('clamps to the 20-2000 range and rounds', () => {
      expect(normalizeBoxHeight(220)).toBe(220);
      expect(normalizeBoxHeight(5)).toBe(20);
      expect(normalizeBoxHeight(5000)).toBe(2000);
      expect(normalizeBoxHeight(45.6)).toBe(46);
    });
    it('rejects non-positive-number input', () => {
      expect(normalizeBoxHeight(null)).toBeNull();
      expect(normalizeBoxHeight(0)).toBeNull();
      expect(normalizeBoxHeight(-5)).toBeNull();
      expect(normalizeBoxHeight('220')).toBeNull();
    });
  });

  describe('normalizeAspect', () => {
    it('accepts W/H ratio strings, with or without spaces', () => {
      expect(normalizeAspect('16/9')).toBe('16/9');
      expect(normalizeAspect('4 / 3')).toBe('4 / 3');
      expect(normalizeAspect('1.5/1')).toBe('1.5/1');
    });
    it('rejects anything that is not a plain ratio', () => {
      expect(normalizeAspect('not-a-ratio')).toBeNull();
      expect(normalizeAspect('16/9; background:url(x)')).toBeNull();
      expect(normalizeAspect('')).toBeNull();
      expect(normalizeAspect(null)).toBeNull();
    });
  });

  describe('normalizeFit / normalizePosition', () => {
    it('only accept known enum values', () => {
      expect(normalizeFit('cover')).toBe('cover');
      expect(normalizeFit('scale-down')).toBe('scale-down');
      expect(normalizeFit('bogus')).toBeNull();
      expect(normalizePosition('top-left')).toBe('top-left');
      expect(normalizePosition('nowhere')).toBeNull();
    });
  });

  describe('effectiveFit / effectivePosition', () => {
    it('are null when boxMode is auto (or absent) — fit/position never apply outside fitted-box mode', () => {
      expect(effectiveFit({})).toBeNull();
      expect(effectiveFit({ boxMode: 'auto', objectFit: 'contain' })).toBeNull();
      expect(effectivePosition({ boxMode: 'auto', objectPosition: 'top' })).toBeNull();
    });
    it('fall back to cover/center when a box mode is active but fit/position are unset', () => {
      expect(effectiveFit({ boxMode: 'height' })).toBe('cover');
      expect(effectivePosition({ boxMode: 'fill' })).toBe('center');
    });
    it('honor an explicit value when a box mode is active', () => {
      expect(effectiveFit({ boxMode: 'aspect', objectFit: 'contain' })).toBe('contain');
      expect(effectivePosition({ boxMode: 'aspect', objectPosition: 'bottom-right' })).toBe('bottom-right');
    });
  });

  describe('boxImgOverrides', () => {
    it('is empty for auto mode — the enforcement point for "default images unchanged"', () => {
      expect(styleAttr(boxImgOverrides({}))).toBe('');
      expect(styleAttr(boxImgOverrides({ boxMode: 'auto', objectFit: 'contain' }))).toBe('');
    });
    it('builds height mode with defaults', () => {
      expect(styleAttr(boxImgOverrides({ boxMode: 'height' }))).toBe('height:300px;object-fit:cover;object-position:center');
    });
    it('builds aspect mode with an explicit ratio', () => {
      expect(styleAttr(boxImgOverrides({ boxMode: 'aspect', boxAspect: '4/3' }))).toBe(
        'aspect-ratio:4/3;object-fit:cover;object-position:center'
      );
    });
    it('builds fill mode as width+height 100%', () => {
      expect(styleAttr(boxImgOverrides({ boxMode: 'fill' }))).toBe('width:100%;height:100%;object-fit:cover;object-position:center');
    });
  });

  describe('boxDataAttr / positionDataAttr', () => {
    it('are null in auto mode, set otherwise', () => {
      expect(boxDataAttr({})).toBeNull();
      expect(boxDataAttr({ boxMode: 'fill' })).toBe('fill');
      expect(positionDataAttr({})).toBeNull();
      expect(positionDataAttr({ boxMode: 'height', objectPosition: 'top' })).toBe('top');
    });
  });

  describe('parseBoxHeight / parseBoxAspect (parseHTML round-trip)', () => {
    it('reads a px height back out', () => {
      expect(parseBoxHeight(style({ height: '220px' }))).toBe(220);
    });
    it('returns null for a missing/malformed height', () => {
      expect(parseBoxHeight(style({ height: '' }))).toBeNull();
      expect(parseBoxHeight(style({ height: 'auto' }))).toBeNull();
      expect(parseBoxHeight(null)).toBeNull();
    });
    it('reads an aspect-ratio back out', () => {
      expect(parseBoxAspect(style({ 'aspect-ratio': '16 / 9' }))).toBe('16 / 9');
    });
    it('returns null for a missing/malformed aspect-ratio', () => {
      expect(parseBoxAspect(style({ 'aspect-ratio': '' }))).toBeNull();
      expect(parseBoxAspect(null)).toBeNull();
    });
  });
});
