// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { GraphQLError } from 'graphql';
import {
  validateTraversalShape,
  collectTraversalPropertyNames,
  collectTraversalEdgeTypes,
  fromWireTraversalQuery,
  MAX_STEPS,
  MAX_STEP_REPEAT,
  MAX_TOTAL_DEPTH,
  MAX_START_NODE_IDS,
  type TraversalQueryInput,
  type WireTraversalQuery
} from './traversal';
import type { EdgeConditionInput } from './nodeFilter';

const edge = (overrides: Partial<EdgeConditionInput> = {}): EdgeConditionInput => ({
  type: 'authored',
  direction: 'outgoing',
  property: null,
  ...overrides
});

const query = (overrides: Partial<TraversalQueryInput> = {}): TraversalQueryInput => ({
  start: { nodeIds: ['p1'] },
  steps: [{ edge: edge(), targetFilter: null, repeat: 1 }],
  ...overrides
});

describe('validateTraversalShape()', () => {
  it('accepts a minimal single-step traversal from explicit node ids', () => {
    expect(() => validateTraversalShape(query())).not.toThrow();
  });

  it('accepts a start filter instead of node ids', () => {
    const q = query({ start: { filter: { property: { name: 'status', operator: 'eq', value: 'active' } } } });
    expect(() => validateTraversalShape(q)).not.toThrow();
  });

  it('rejects start with neither nodeIds nor filter', () => {
    expect(() => validateTraversalShape(query({ start: {} }))).toThrow(GraphQLError);
  });

  it('rejects start with both nodeIds and filter', () => {
    const q = query({ start: { nodeIds: ['p1'], filter: { property: { name: 'x', operator: 'exists' } } } });
    expect(() => validateTraversalShape(q)).toThrow(GraphQLError);
  });

  it('rejects empty start.nodeIds', () => {
    expect(() => validateTraversalShape(query({ start: { nodeIds: [] } }))).toThrow(GraphQLError);
  });

  it(`rejects more than ${MAX_START_NODE_IDS} start node ids`, () => {
    const ids = Array.from({ length: MAX_START_NODE_IDS + 1 }, (_, i) => `p${i}`);
    expect(() => validateTraversalShape(query({ start: { nodeIds: ids } }))).toThrow(GraphQLError);
  });

  it('rejects empty steps', () => {
    expect(() => validateTraversalShape(query({ steps: [] }))).toThrow(GraphQLError);
  });

  it(`rejects more than ${MAX_STEPS} steps`, () => {
    const steps = Array.from({ length: MAX_STEPS + 1 }, () => ({ edge: edge(), targetFilter: null, repeat: 1 }));
    expect(() => validateTraversalShape(query({ steps }))).toThrow(GraphQLError);
  });

  it(`rejects a step repeat above ${MAX_STEP_REPEAT}`, () => {
    const q = query({ steps: [{ edge: edge(), targetFilter: null, repeat: MAX_STEP_REPEAT + 1 }] });
    expect(() => validateTraversalShape(q)).toThrow(GraphQLError);
  });

  it('rejects a step repeat below 1 or non-integer', () => {
    expect(() => validateTraversalShape(query({ steps: [{ edge: edge(), targetFilter: null, repeat: 0 }] }))).toThrow(GraphQLError);
    expect(() => validateTraversalShape(query({ steps: [{ edge: edge(), targetFilter: null, repeat: 1.5 }] }))).toThrow(GraphQLError);
  });

  it(`rejects a total depth (sum of repeats) above ${MAX_TOTAL_DEPTH} even when each step is individually within bounds`, () => {
    // 3 steps * repeat 4 = 12 > 10, each step under its own cap of 5.
    const steps = Array.from({ length: 3 }, () => ({ edge: edge(), targetFilter: null, repeat: 4 }));
    expect(() => validateTraversalShape(query({ steps }))).toThrow(GraphQLError);
  });

  it('accepts a total depth exactly at the bound', () => {
    const steps = [
      { edge: edge(), targetFilter: null, repeat: MAX_STEP_REPEAT },
      { edge: edge(), targetFilter: null, repeat: MAX_TOTAL_DEPTH - MAX_STEP_REPEAT }
    ];
    expect(() => validateTraversalShape(query({ steps }))).not.toThrow();
  });

  it('validates each step\'s targetFilter shape (delegates to the existing filter validator)', () => {
    const pathologicallyDeep = (depth: number): { and: unknown[] } | { property: { name: string; operator: 'exists' } } =>
      depth === 0 ? { property: { name: 'x', operator: 'exists' } } : { and: [pathologicallyDeep(depth - 1)] };
    const q = query({ steps: [{ edge: edge(), targetFilter: pathologicallyDeep(10) as never, repeat: 1 }] });
    expect(() => validateTraversalShape(q)).toThrow(GraphQLError);
  });

  it('validates start.filter shape too', () => {
    const q = query({ start: { filter: { and: [] } } }); // empty and/or is invalid
    expect(() => validateTraversalShape(q)).toThrow(GraphQLError);
  });
});

describe('collectTraversalPropertyNames()', () => {
  it('collects names from start.filter, step edge properties, and step target filters', () => {
    const q: TraversalQueryInput = {
      start: { filter: { property: { name: 'startProp', operator: 'exists' } } },
      steps: [
        { edge: edge({ property: { name: 'edgeProp', operator: 'exists' } }), targetFilter: { property: { name: 'targetProp', operator: 'exists' } }, repeat: 1 }
      ]
    };
    expect([...collectTraversalPropertyNames(q)].sort()).toEqual(['edgeProp', 'startProp', 'targetProp']);
  });

  it('returns an empty set when nothing references a property', () => {
    expect(collectTraversalPropertyNames(query({ start: { nodeIds: ['p1'] } })).size).toBe(0);
  });
});

describe('collectTraversalEdgeTypes()', () => {
  it('always includes every step\'s edge type, plus any edge types inside filters', () => {
    const q: TraversalQueryInput = {
      start: { filter: { edge: { type: 'startLink', direction: 'outgoing', property: null } } },
      steps: [
        { edge: edge({ type: 'stepEdge' }), targetFilter: { edge: { type: 'targetLink', direction: 'either', property: null } }, repeat: 1 }
      ]
    };
    expect([...collectTraversalEdgeTypes(q)].sort()).toEqual(['startLink', 'stepEdge', 'targetLink']);
  });
});

describe('fromWireTraversalQuery()', () => {
  it('translates wire direction/operator enums to internal lowercase form, mirroring fromWireFilter', () => {
    const wire: WireTraversalQuery = {
      start: { nodeIds: ['p1'] },
      steps: [
        {
          edge: { type: 'authored', direction: 'INCOMING', property: { name: 'weight', operator: 'GT', value: '1' } },
          targetFilter: { property: { name: 'status', operator: 'EQ', value: 'active' } },
          repeat: 2
        }
      ]
    };
    const internal = fromWireTraversalQuery(wire);
    expect(internal).toEqual({
      start: { nodeIds: ['p1'], filter: null },
      steps: [
        {
          edge: { type: 'authored', direction: 'incoming', property: { name: 'weight', operator: 'gt', value: '1' } },
          targetFilter: { property: { name: 'status', operator: 'eq', value: 'active' } },
          repeat: 2
        }
      ]
    });
  });

  it('translates a filter-based start the same way fromWireFilter would', () => {
    const wire: WireTraversalQuery = {
      start: { filter: { property: { name: 'status', operator: 'EQ', value: 'active' } } },
      steps: [{ edge: { type: 'authored', direction: 'OUTGOING', property: null }, repeat: 1 }]
    };
    const internal = fromWireTraversalQuery(wire);
    expect(internal.start).toEqual({ nodeIds: null, filter: { property: { name: 'status', operator: 'eq', value: 'active' } } });
  });
});
