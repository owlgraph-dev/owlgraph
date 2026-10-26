// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  blockSpaceVars,
  flowRhythmVars,
  normalizeSpacingData,
  padVars,
  resolvedSpace,
  setSpacingField,
  spaceAboveVars,
  type SpacingData,
} from './spacing';

describe('resolvedSpace', () => {
  it('is null when no tier sets the field — the caller reads that as Auto', () => {
    expect(resolvedSpace(undefined, 'desktop', 'blockSpace')).toBe(null);
    expect(resolvedSpace({ desktop: { pad: 16 } }, 'phone', 'spaceAbove')).toBe(null);
  });

  it('walks the desktop-first chain', () => {
    const data: SpacingData = { desktop: { blockSpace: 24 }, phone: { blockSpace: 12 } };
    expect(resolvedSpace(data, 'desktop', 'blockSpace')).toBe(24);
    expect(resolvedSpace(data, 'tablet', 'blockSpace')).toBe(24);
    expect(resolvedSpace(data, 'phone', 'blockSpace')).toBe(12);
  });

  it('keeps the two fields independent — neither falls back to the other', () => {
    const data: SpacingData = { desktop: { blockSpace: 24 } };
    expect(resolvedSpace(data, 'desktop', 'spaceAbove')).toBe(null);
  });
});

describe('padVars', () => {
  it('emits nothing for a block that sets nothing — the group default is the theme stylesheet', () => {
    expect(padVars(undefined, 8)).toEqual({});
    expect(padVars({}, null)).toEqual({});
    expect(padVars({ desktop: { blockSpace: 24 } }, 8)).toEqual({});
  });

  it('emits the uniform shorthand, and leaves out a value equal to the group default', () => {
    expect(padVars({ desktop: { pad: 16 } }, 8)).toEqual({ '--pad-d': '16px' });
    expect(padVars({ desktop: { pad: 8 } }, 8)).toEqual({});
    expect(padVars({ desktop: { pad: 0 } }, null)).toEqual({});
    expect(padVars({ desktop: { pad: 0 } }, 8)).toEqual({ '--pad-d': '0px' });
  });

  it('emits per-side values only where they differ from the shorthand or the chain', () => {
    expect(padVars({ desktop: { pad: 16, top: 4 } }, 8)).toEqual({ '--pad-d': '16px', '--pad-d-top': '4px' });
    expect(padVars({ desktop: { pad: 16, top: 16 } }, 8)).toEqual({ '--pad-d': '16px' });
    // No shorthand: a side equal to the default is what the chain gives anyway.
    expect(padVars({ desktop: { top: 8, left: 24 } }, 8)).toEqual({ '--pad-d-left': '24px' });
    // A uniform value the default already gives, with one side deviating.
    expect(padVars({ desktop: { pad: 8, bottom: 0 } }, 8)).toEqual({ '--pad-d-bottom': '0px' });
  });

  it("compares a tablet or phone tier against the tier above's effective sides", () => {
    // Tablet repeats desktop: nothing.
    expect(padVars({ desktop: { pad: 16 }, tablet: { pad: 16 } }, 8)).toEqual({ '--pad-d': '16px' });
    // Tablet goes back to the default: emitted, the chain would give 16 otherwise.
    expect(padVars({ desktop: { pad: 16 }, tablet: { pad: 8 } }, 8)).toEqual({ '--pad-d': '16px', '--pad-t': '8px' });
    // Desktop has one side apart; a uniform tablet value overrides that side too.
    expect(padVars({ desktop: { top: 4 }, tablet: { pad: 8 } }, 8)).toEqual({ '--pad-d-top': '4px', '--pad-t': '8px' });
    // Phone compares against tablet's effective value.
    expect(padVars({ desktop: { pad: 16 }, tablet: { pad: 8 }, phone: { pad: 8 } }, 8)).toEqual({ '--pad-d': '16px', '--pad-t': '8px' });
  });
});

describe('blockSpaceVars', () => {
  it('emits nothing for a flow that inherits (no own value)', () => {
    expect(blockSpaceVars(undefined)).toEqual({});
    expect(blockSpaceVars({ desktop: { pad: 8 } })).toEqual({});
  });

  it('emits a COMPLETE triple once any tier is set, so no tier can mix with an inherited one', () => {
    expect(blockSpaceVars({ phone: { blockSpace: 12 } })).toEqual({ '--block-space-d': '0px', '--block-space-t': '0px', '--block-space-p': '12px' });
    expect(blockSpaceVars({ desktop: { blockSpace: 32 }, phone: { blockSpace: 12 } })).toEqual({
      '--block-space-d': '32px',
      '--block-space-t': '32px',
      '--block-space-p': '12px',
    });
  });

  // So a container's own rhythm can't feed the space above itself; its cells relay it (app.css).
  it('publishes as --flow-space-* for a flow that is also a block', () => {
    expect(blockSpaceVars({ desktop: { blockSpace: 40 } }, null, 'flow-space')).toEqual({
      '--flow-space-d': '40px',
      '--flow-space-t': '40px',
      '--flow-space-p': '40px',
    });
    expect(blockSpaceVars(undefined, null, 'flow-space')).toEqual({});
  });

  it('with a fallback (the page), fills an unset desktop from it and emits nothing when the triple equals it', () => {
    expect(blockSpaceVars(undefined, 24)).toEqual({});
    expect(blockSpaceVars({ desktop: { blockSpace: 24 } }, 24)).toEqual({});
    expect(blockSpaceVars({ tablet: { blockSpace: 16 } }, 24)).toEqual({ '--block-space-d': '24px', '--block-space-t': '16px', '--block-space-p': '16px' });
    expect(flowRhythmVars({ desktop: { blockSpace: 40 } }, 24)).toEqual({
      '--block-space-d': '40px',
      '--block-space-t': '40px',
      '--block-space-p': '40px',
      '--flow-space-d': '40px',
      '--flow-space-t': '40px',
      '--flow-space-p': '40px',
    });
  });
});

describe('spaceAboveVars', () => {
  it('is fully sparse — an absent desktop var is what lets the block type default apply', () => {
    expect(spaceAboveVars(undefined)).toEqual({});
    expect(spaceAboveVars({ phone: { spaceAbove: 0 } })).toEqual({ '--space-above-p': '0px' });
    expect(spaceAboveVars({ desktop: { spaceAbove: 48 }, tablet: { spaceAbove: 24 } })).toEqual({ '--space-above-d': '48px', '--space-above-t': '24px' });
  });
});

describe('normalizeSpacingData', () => {
  it('keeps the space fields and drops malformed ones', () => {
    expect(normalizeSpacingData({ desktop: { blockSpace: 24, spaceAbove: 8 } })).toEqual({
      desktop: { blockSpace: 24, spaceAbove: 8 },
    });
    expect(normalizeSpacingData({ desktop: { blockSpace: 'x', spaceAbove: null } })).toEqual({});
  });

  it('clamps like every other px field', () => {
    expect(normalizeSpacingData({ desktop: { blockSpace: -5, spaceAbove: 9999 } })).toEqual({
      desktop: { blockSpace: 0, spaceAbove: 200 },
    });
  });
});

describe('setSpacingField', () => {
  it('sets and clears one space field without touching the other, or padding', () => {
    const withPad: SpacingData = { desktop: { pad: 16, left: 24 } };
    const set = setSpacingField(withPad, 'desktop', 'blockSpace', 32);
    expect(set).toEqual({ desktop: { pad: 16, left: 24, blockSpace: 32 } });

    const both = setSpacingField(set, 'desktop', 'spaceAbove', 8);
    expect(both.desktop).toEqual({ pad: 16, left: 24, blockSpace: 32, spaceAbove: 8 });

    expect(setSpacingField(both, 'desktop', 'blockSpace', null).desktop).toEqual({ pad: 16, left: 24, spaceAbove: 8 });
  });

  it('does not clear the space fields when a uniform pad is picked', () => {
    const data: SpacingData = { desktop: { left: 24, blockSpace: 32, spaceAbove: 8 } };
    expect(setSpacingField(data, 'desktop', 'pad', 16).desktop).toEqual({ pad: 16, blockSpace: 32, spaceAbove: 8 });
  });

  it('drops the tier once its last field goes, keeping storage sparse', () => {
    expect(setSpacingField({ phone: { spaceAbove: 8 } }, 'phone', 'spaceAbove', null)).toEqual({});
  });
});
