// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { GraphQLError } from 'graphql';
import {
  validateLeafCondition,
  validateFilterShape,
  validateFilterOperators,
  validateIntrinsicCondition,
  validateTagCondition,
  collectPropertyNames,
  collectEdgeTypes,
  fromWireOrderBy,
  fromWireFilter,
  WIRE_OPERATORS_BY_DATATYPE,
  WIRE_INTRINSIC_OPERATORS_BY_CATEGORY,
  INTRINSIC_FIELD_FROM_WIRE,
  type NodeFilterInput,
  type PropertyConditionInput,
  type IntrinsicConditionInput,
  type TagConditionInput,
  type WireNodeFilter
} from './nodeFilter';

const cond = (overrides: Partial<PropertyConditionInput>): PropertyConditionInput => ({
  name: 'status',
  operator: 'eq',
  value: 'done',
  ...overrides
});

describe('validateLeafCondition()', () => {
  describe('operator/datatype validity', () => {
    it('text: allows eq/neq/contains/exists/notExists/in', () => {
      for (const operator of ['eq', 'neq', 'contains', 'in'] as const) {
        expect(() =>
          validateLeafCondition(
            operator === 'in' ? cond({ operator, value: undefined, values: ['a'] }) : cond({ operator }),
            'text'
          )
        ).not.toThrow();
      }
      expect(() => validateLeafCondition(cond({ operator: 'exists', value: undefined }), 'text')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'notExists', value: undefined }), 'text')).not.toThrow();
    });

    it('text: rejects numeric comparison operators', () => {
      for (const operator of ['gt', 'gte', 'lt', 'lte'] as const) {
        expect(() => validateLeafCondition(cond({ operator }), 'text')).toThrow(GraphQLError);
      }
    });

    it('url and page datatypes behave like text', () => {
      expect(() => validateLeafCondition(cond({ operator: 'contains' }), 'url')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'contains' }), 'page')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'gt' }), 'url')).toThrow(GraphQLError);
    });

    it('number: allows eq/neq/gt/gte/lt/lte/exists/notExists/in, rejects contains', () => {
      for (const operator of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const) {
        expect(() => validateLeafCondition(cond({ operator, value: '1' }), 'number')).not.toThrow();
      }
      expect(() => validateLeafCondition(cond({ operator: 'contains', value: '1' }), 'number')).toThrow(GraphQLError);
    });

    it('date: allows comparisons, rejects contains', () => {
      expect(() => validateLeafCondition(cond({ operator: 'gt', value: '2024-01-01' }), 'date')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'contains', value: '2024-01-01' }), 'date')).toThrow(
        GraphQLError
      );
    });

    it('boolean: only eq/neq/exists/notExists', () => {
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: 'true' }), 'boolean')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'exists', value: undefined }), 'boolean')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'gt', value: 'true' }), 'boolean')).toThrow(GraphQLError);
      expect(() => validateLeafCondition(cond({ operator: 'contains', value: 'true' }), 'boolean')).toThrow(
        GraphQLError
      );
    });

    it('unregistered property names default to text-datatype operator rules', () => {
      expect(() => validateLeafCondition(cond({ operator: 'contains' }), 'nonsense-unregistered')).not.toThrow();
      expect(() => validateLeafCondition(cond({ operator: 'gt' }), 'nonsense-unregistered')).toThrow(GraphQLError);
    });
  });

  describe('value/values shape', () => {
    it('exists/notExists reject value and values', () => {
      expect(() => validateLeafCondition(cond({ operator: 'exists', value: 'x' }), 'text')).toThrow(GraphQLError);
      expect(() => validateLeafCondition(cond({ operator: 'notExists', values: ['x'] }), 'text')).toThrow(
        GraphQLError
      );
    });

    it('in requires values, not value', () => {
      expect(() => validateLeafCondition(cond({ operator: 'in', value: undefined, values: [] }), 'text')).toThrow(
        GraphQLError
      );
      expect(() =>
        validateLeafCondition(cond({ operator: 'in', value: 'x', values: ['a'] }), 'text')
      ).toThrow(GraphQLError);
      expect(() =>
        validateLeafCondition(cond({ operator: 'in', value: undefined, values: ['a'] }), 'text')
      ).not.toThrow();
    });

    it('eq/neq/gt/etc require value, not values', () => {
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: undefined }), 'text')).toThrow(GraphQLError);
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: 'a', values: ['b'] }), 'text')).toThrow(
        GraphQLError
      );
    });
  });

  describe('numeric/date literal format', () => {
    it('accepts valid numeric literals, including negatives and decimals', () => {
      for (const v of ['1', '-1', '1.5', '-1.5']) {
        expect(() => validateLeafCondition(cond({ operator: 'eq', value: v }), 'number')).not.toThrow();
      }
    });

    it('rejects non-numeric literals', () => {
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: 'abc' }), 'number')).toThrow(GraphQLError);
    });

    it('accepts a valid calendar date', () => {
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: '2024-01-01' }), 'date')).not.toThrow();
    });

    it('rejects a format-matching but calendar-invalid date', () => {
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: '2024-13-45' }), 'date')).toThrow(
        GraphQLError
      );
    });

    it('rejects a malformed date literal', () => {
      expect(() => validateLeafCondition(cond({ operator: 'eq', value: '01/01/2024' }), 'date')).toThrow(
        GraphQLError
      );
    });

    it('validates every literal in an IN list', () => {
      expect(() =>
        validateLeafCondition(cond({ operator: 'in', value: undefined, values: ['1', 'not-a-number'] }), 'number')
      ).toThrow(GraphQLError);
    });
  });
});

const intrinsicCond = (overrides: Partial<IntrinsicConditionInput>): IntrinsicConditionInput => ({
  field: 'title',
  operator: 'eq',
  value: 'hello',
  ...overrides
});

describe('validateIntrinsicCondition()', () => {
  it('text (slug/title): allows eq/neq/contains/in/startsWith, rejects gt/exists', () => {
    for (const operator of ['eq', 'neq', 'contains', 'startsWith'] as const) {
      expect(() => validateIntrinsicCondition(intrinsicCond({ operator }))).not.toThrow();
    }
    expect(() => validateIntrinsicCondition(intrinsicCond({ operator: 'in', value: undefined, values: ['a'] }))).not.toThrow();
    for (const operator of ['gt', 'exists', 'notExists'] as const) {
      expect(() => validateIntrinsicCondition(intrinsicCond({ operator, value: undefined }))).toThrow(GraphQLError);
    }
  });

  it('date (createdAt/updatedAt): allows range operators, rejects startsWith/contains, requires YYYY-MM-DD', () => {
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'createdAt', operator: 'gte', value: '2026-01-01' }))).not.toThrow();
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'createdAt', operator: 'startsWith', value: '2026' }))).toThrow(GraphQLError);
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'createdAt', operator: 'contains', value: '2026' }))).toThrow(GraphQLError);
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'createdAt', operator: 'eq', value: 'not-a-date' }))).toThrow(GraphQLError);
  });

  it('type: allows only eq/neq/in, rejects an unknown node type value', () => {
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'type', operator: 'eq', value: 'page' }))).not.toThrow();
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'type', operator: 'gt', value: 'page' }))).toThrow(GraphQLError);
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'type', operator: 'eq', value: 'spreadsheet' }))).toThrow(GraphQLError);
  });

  it('namespaceId/createdBy: allows only eq/neq/in, requires a UUID-shaped value', () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'namespaceId', operator: 'eq', value: uuid }))).not.toThrow();
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'createdBy', operator: 'eq', value: uuid }))).not.toThrow();
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'namespaceId', operator: 'contains', value: uuid }))).toThrow(GraphQLError);
    expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'namespaceId', operator: 'eq', value: 'not-a-uuid' }))).toThrow(GraphQLError);
  });

  it('"in" requires "values" (and not "value"); every other operator requires "value" (and not "values")', () => {
    expect(() => validateIntrinsicCondition(intrinsicCond({ operator: 'in', value: 'x', values: undefined }))).toThrow(GraphQLError);
    expect(() => validateIntrinsicCondition(intrinsicCond({ operator: 'eq', value: undefined, values: ['x'] }))).toThrow(GraphQLError);
  });

  describe('classId (polymorphic by default)', () => {
    const uuid = '22222222-2222-2222-2222-222222222222';

    it('allows eq/neq/in with UUID-shaped class ids, rejects text/ordering operators', () => {
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'eq', value: uuid }))).not.toThrow();
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'neq', value: uuid }))).not.toThrow();
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'in', value: undefined, values: [uuid] }))).not.toThrow();
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'contains', value: uuid }))).toThrow(GraphQLError);
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'gt', value: uuid }))).toThrow(GraphQLError);
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'eq', value: 'work-package' }))).toThrow(GraphQLError);
    });

    it('no longer accepts exists/notExists — every node has a class, so there is no unclassified state to test for', () => {
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'exists', value: undefined }))).toThrow(GraphQLError);
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'notExists', value: undefined }))).toThrow(GraphQLError);
    });

    it('exists/notExists are rejected on every nodes-column field', () => {
      for (const field of ['slug', 'title', 'type', 'namespaceId', 'createdBy', 'createdAt', 'updatedAt', 'classId'] as const) {
        expect(() => validateIntrinsicCondition(intrinsicCond({ field, operator: 'exists', value: undefined }))).toThrow(GraphQLError);
      }
    });

    it('accepts classMatch isA/exact on classId only', () => {
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'eq', value: uuid, classMatch: 'isA' }))).not.toThrow();
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'classId', operator: 'eq', value: uuid, classMatch: 'exact' }))).not.toThrow();
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'type', operator: 'eq', value: 'page', classMatch: 'exact' }))).toThrow(GraphQLError);
    });

    it('the wire operator table for the class category is EQ/NEQ/IN', () => {
      expect(WIRE_INTRINSIC_OPERATORS_BY_CATEGORY.class).toEqual(['EQ', 'NEQ', 'IN']);
    });
  });

  describe('externalUrl (nullable: a link document only)', () => {
    it('allows exists/notExists with no value, and the text matches with one', () => {
      for (const operator of ['exists', 'notExists'] as const) {
        expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'externalUrl', operator, value: undefined }))).not.toThrow();
      }
      for (const operator of ['eq', 'neq', 'contains', 'startsWith'] as const) {
        expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'externalUrl', operator, value: 'doi.org' }))).not.toThrow();
      }
    });

    it('rejects a value on a presence check, and in/ordering operators', () => {
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'externalUrl', operator: 'exists', value: 'x' }))).toThrow(GraphQLError);
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'externalUrl', operator: 'in', value: undefined, values: ['x'] }))).toThrow(GraphQLError);
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'externalUrl', operator: 'gt', value: 'x' }))).toThrow(GraphQLError);
    });

    it('round-trips through the wire field name', () => {
      expect(INTRINSIC_FIELD_FROM_WIRE.EXTERNAL_URL).toBe('externalUrl');
      expect(WIRE_INTRINSIC_OPERATORS_BY_CATEGORY.externalUrl).toEqual(['EXISTS', 'NOT_EXISTS', 'EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH']);
    });
  });

  describe('locale (the content language: a closed set of codes)', () => {
    it('takes eq/neq/in over supported language codes', () => {
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'locale', operator: 'eq', value: 'en' }))).not.toThrow();
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'locale', operator: 'in', value: undefined, values: ['de', 'en'] }))).not.toThrow();
      expect(WIRE_INTRINSIC_OPERATORS_BY_CATEGORY.locale).toEqual(['EQ', 'NEQ', 'IN']);
      expect(INTRINSIC_FIELD_FROM_WIRE.LOCALE).toBe('locale');
    });

    it('refuses an unknown language and text operators', () => {
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'locale', operator: 'eq', value: 'fr' }))).toThrow(GraphQLError);
      expect(() => validateIntrinsicCondition(intrinsicCond({ field: 'locale', operator: 'contains', value: 'e' }))).toThrow(GraphQLError);
    });
  });

  it('WIRE_INTRINSIC_OPERATORS_BY_CATEGORY mirrors the internal operator table in wire (SCREAMING_CASE) form', () => {
    expect(WIRE_INTRINSIC_OPERATORS_BY_CATEGORY.text).toEqual(['EQ', 'NEQ', 'CONTAINS', 'IN', 'STARTS_WITH']);
    expect(WIRE_INTRINSIC_OPERATORS_BY_CATEGORY.date).toEqual(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN']);
    expect(WIRE_INTRINSIC_OPERATORS_BY_CATEGORY.type).toEqual(['EQ', 'NEQ', 'IN']);
  });
});

describe('fromWireOrderBy() — an intrinsic sort names a known field', () => {
  it('accepts every intrinsic field, locale included', () => {
    expect(fromWireOrderBy({ kind: 'INTRINSIC', name: 'locale', direction: 'ASC' })).toEqual({ kind: 'intrinsic', name: 'locale', direction: 'asc' });
  });

  it('refuses an unknown one as bad input, not a database error', () => {
    expect(() => fromWireOrderBy({ kind: 'INTRINSIC', name: 'nope; drop table', direction: 'ASC' })).toThrow(GraphQLError);
  });
});

describe('validateTagCondition()', () => {
  const tag = (overrides: Partial<TagConditionInput>): TagConditionInput => ({ operator: 'has', value: 'alpha', ...overrides });

  it('has requires exactly "value"', () => {
    expect(() => validateTagCondition(tag({}))).not.toThrow();
    expect(() => validateTagCondition(tag({ value: undefined }))).toThrow(GraphQLError);
    expect(() => validateTagCondition(tag({ values: ['alpha'] }))).toThrow(GraphQLError);
    expect(() => validateTagCondition(tag({ value: undefined, values: ['alpha'] }))).toThrow(GraphQLError);
  });

  it('hasAny/hasAll/hasNone require a non-empty "values" list and no "value"', () => {
    for (const operator of ['hasAny', 'hasAll', 'hasNone'] as const) {
      expect(() => validateTagCondition(tag({ operator, value: undefined, values: ['a', 'b'] }))).not.toThrow();
      expect(() => validateTagCondition(tag({ operator, value: undefined, values: [] }))).toThrow(GraphQLError);
      expect(() => validateTagCondition(tag({ operator, value: undefined }))).toThrow(GraphQLError);
      expect(() => validateTagCondition(tag({ operator, value: 'a', values: ['a'] }))).toThrow(GraphQLError);
    }
  });

  it('rejects blank tags and an unknown operator', () => {
    expect(() => validateTagCondition(tag({ value: '   ' }))).toThrow(GraphQLError);
    expect(() => validateTagCondition(tag({ operator: 'hasAny', value: undefined, values: ['a', ''] }))).toThrow(GraphQLError);
    expect(() => validateTagCondition(tag({ operator: 'eq' as never }))).toThrow(GraphQLError);
  });

  it('caps the list length at 50', () => {
    const values = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(() => validateTagCondition(tag({ operator: 'hasAny', value: undefined, values: values(50) }))).not.toThrow();
    expect(() => validateTagCondition(tag({ operator: 'hasAny', value: undefined, values: values(51) }))).toThrow(GraphQLError);
  });
});

describe('validateFilterShape()', () => {
  const leaf = (name = 'status'): NodeFilterInput => ({ property: cond({ name }) });

  it('accepts a tag condition as a leaf, and rejects one combined with property', () => {
    expect(() => validateFilterShape({ tag: { operator: 'has', value: 'alpha' } })).not.toThrow();
    expect(() => validateFilterShape({ and: [leaf(), { tag: { operator: 'hasAny', values: ['a'] } }] })).not.toThrow();
    expect(() => validateFilterShape({ property: cond({}), tag: { operator: 'has', value: 'alpha' } })).toThrow(GraphQLError);
  });

  it('accepts a single leaf', () => {
    expect(() => validateFilterShape(leaf())).not.toThrow();
  });

  it('accepts a simple and/or', () => {
    expect(() => validateFilterShape({ and: [leaf('a'), leaf('b')] })).not.toThrow();
    expect(() => validateFilterShape({ or: [leaf('a'), leaf('b')] })).not.toThrow();
  });

  it('rejects a node with none of property/and/or set', () => {
    expect(() => validateFilterShape({})).toThrow(GraphQLError);
  });

  it('rejects a node with more than one of property/and/or set', () => {
    expect(() => validateFilterShape({ property: cond({}), and: [leaf()] })).toThrow(GraphQLError);
  });

  it('rejects an empty and/or list', () => {
    expect(() => validateFilterShape({ and: [] })).toThrow(GraphQLError);
    expect(() => validateFilterShape({ or: [] })).toThrow(GraphQLError);
  });

  it('accepts an edge condition, with or without a nested property', () => {
    expect(() => validateFilterShape({ edge: { type: 'author-of', direction: 'outgoing' } })).not.toThrow();
    expect(() =>
      validateFilterShape({ edge: { type: 'author-of', direction: 'outgoing', property: cond({ name: 'core:year' }) } })
    ).not.toThrow();
  });

  it('rejects a node with both property and edge set', () => {
    expect(() => validateFilterShape({ property: cond({}), edge: { type: 'author-of', direction: 'outgoing' } })).toThrow(
      GraphQLError
    );
  });

  it('accepts an intrinsic condition, and rejects one combined with property', () => {
    expect(() => validateFilterShape({ intrinsic: intrinsicCond({}) })).not.toThrow();
    expect(() => validateFilterShape({ property: cond({}), intrinsic: intrinsicCond({}) })).toThrow(GraphQLError);
  });

  it('accepts depth exactly at the cap (5) and rejects one level deeper', () => {
    // depth 1: root and -> depth 2..5: nested single-child and -> depth 5 leaf
    const depth5: NodeFilterInput = { and: [{ and: [{ and: [{ and: [leaf()] }] }] }] };
    expect(() => validateFilterShape(depth5)).not.toThrow();

    const depth6: NodeFilterInput = { and: [{ and: [{ and: [{ and: [{ and: [leaf()] }] }] }] }] };
    expect(() => validateFilterShape(depth6)).toThrow(GraphQLError);
  });

  it('accepts exactly 25 leaves and rejects 26', () => {
    const leaves25: NodeFilterInput = { or: Array.from({ length: 25 }, (_, i) => leaf(`a${i}`)) };
    expect(() => validateFilterShape(leaves25)).not.toThrow();

    const leaves26: NodeFilterInput = { or: Array.from({ length: 26 }, (_, i) => leaf(`a${i}`)) };
    expect(() => validateFilterShape(leaves26)).toThrow(GraphQLError);
  });
});

describe('collectPropertyNames()', () => {
  it('collects distinct names across a nested tree', () => {
    const filter: NodeFilterInput = {
      or: [
        { property: cond({ name: 'status' }) },
        { and: [{ property: cond({ name: 'priority' }) }, { property: cond({ name: 'status' }) }] }
      ]
    };
    expect([...collectPropertyNames(filter)].sort()).toEqual(['priority', 'status']);
  });

  it('includes an edge condition\'s nested edge-property name', () => {
    const filter: NodeFilterInput = {
      or: [
        { property: cond({ name: 'status' }) },
        { edge: { type: 'author-of', direction: 'outgoing', property: cond({ name: 'core:year' }) } }
      ]
    };
    expect([...collectPropertyNames(filter)].sort()).toEqual(['core:year', 'status']);
  });
});

describe('collectEdgeTypes()', () => {
  it('collects distinct relationship-type slugs across a nested tree', () => {
    const filter: NodeFilterInput = {
      or: [
        { edge: { type: 'author-of', direction: 'outgoing' } },
        { and: [{ edge: { type: 'published-in', direction: 'either' } }, { edge: { type: 'author-of', direction: 'incoming' } }] }
      ]
    };
    expect([...collectEdgeTypes(filter)].sort()).toEqual(['author-of', 'published-in']);
  });

  it('is empty for a filter with no edge conditions', () => {
    expect(collectEdgeTypes({ property: cond({}) }).size).toBe(0);
  });
});

describe('validateFilterOperators()', () => {
  it('rejects an operator invalid for a resolved datatype deep in the tree', () => {
    const filter: NodeFilterInput = {
      and: [{ property: cond({ name: 'status' }) }, { property: cond({ name: 'priority', operator: 'contains' }) }]
    };
    const datatypes = new Map([['priority', 'number']]);
    expect(() => validateFilterOperators(filter, datatypes)).toThrow(GraphQLError);
  });

  it('accepts a tree where every leaf matches its resolved datatype', () => {
    const filter: NodeFilterInput = {
      and: [
        { property: cond({ name: 'status', operator: 'eq', value: 'done' }) },
        { property: cond({ name: 'priority', operator: 'gt', value: '1' }) }
      ]
    };
    const datatypes = new Map([['priority', 'number']]);
    expect(() => validateFilterOperators(filter, datatypes)).not.toThrow();
  });

  it('validates an edge condition\'s nested property against its resolved datatype', () => {
    const filter: NodeFilterInput = { edge: { type: 'author-of', direction: 'outgoing', property: cond({ name: 'core:year', operator: 'contains' }) } };
    const datatypes = new Map([['core:year', 'number']]);
    expect(() => validateFilterOperators(filter, datatypes)).toThrow(GraphQLError);
  });

  it('accepts an edge condition with no nested property', () => {
    const filter: NodeFilterInput = { edge: { type: 'author-of', direction: 'outgoing' } };
    expect(() => validateFilterOperators(filter, new Map())).not.toThrow();
  });

  it('validates a tag leaf deep in the tree', () => {
    const ok: NodeFilterInput = { and: [{ property: cond({}) }, { tag: { operator: 'hasAll', values: ['a', 'b'] } }] };
    expect(() => validateFilterOperators(ok, new Map())).not.toThrow();
    const bad: NodeFilterInput = { and: [{ property: cond({}) }, { tag: { operator: 'hasAll', values: [] } }] };
    expect(() => validateFilterOperators(bad, new Map())).toThrow(GraphQLError);
  });
});

describe('fromWireFilter()', () => {
  it('translates an edge condition, including its nested property operator', () => {
    const wire: WireNodeFilter = {
      edge: { type: 'author-of', direction: 'OUTGOING', property: { name: 'core:year', operator: 'GT', value: '1990' } }
    };
    expect(fromWireFilter(wire)).toEqual({
      edge: { type: 'author-of', direction: 'outgoing', property: { name: 'core:year', operator: 'gt', value: '1990' } }
    });
  });

  it('translates an edge condition with no nested property', () => {
    const wire: WireNodeFilter = { edge: { type: 'author-of', direction: 'EITHER' } };
    expect(fromWireFilter(wire)).toEqual({ edge: { type: 'author-of', direction: 'either', property: null } });
  });

  it('translates an intrinsic condition, field and operator both', () => {
    const wire: WireNodeFilter = { intrinsic: { field: 'CREATED_AT', operator: 'GTE', value: '2026-01-01' } };
    expect(fromWireFilter(wire)).toEqual({ intrinsic: { field: 'createdAt', operator: 'gte', value: '2026-01-01', values: undefined } });
  });

  it('translates a class condition (CLASS_ID -> classId) and its match mode (EXACT -> exact); no mode stays absent (= is-a)', () => {
    const id = '33333333-3333-3333-3333-333333333333';
    expect(fromWireFilter({ intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: id, classMatch: 'EXACT' } })).toEqual({
      intrinsic: { field: 'classId', operator: 'eq', value: id, values: undefined, classMatch: 'exact' }
    });
    const isA = fromWireFilter({ intrinsic: { field: 'CLASS_ID', operator: 'NEQ', value: id } });
    expect(isA).toEqual({ intrinsic: { field: 'classId', operator: 'neq', value: id, values: undefined } });
    expect('classMatch' in isA.intrinsic!).toBe(false);
  });

  it('translates a tag condition\'s operator (HAS_ANY -> hasAny) and keeps its values', () => {
    expect(fromWireFilter({ tag: { operator: 'HAS', value: 'alpha' } })).toEqual({ tag: { operator: 'has', value: 'alpha' } });
    expect(fromWireFilter({ or: [{ tag: { operator: 'HAS_ANY', values: ['a', 'b'] } }, { tag: { operator: 'HAS_NONE', values: ['c'] } }] })).toEqual({
      or: [{ tag: { operator: 'hasAny', values: ['a', 'b'] } }, { tag: { operator: 'hasNone', values: ['c'] } }]
    });
  });
});

describe('fromWireOrderBy()', () => {
  it('returns null for null/undefined', () => {
    expect(fromWireOrderBy(null)).toBeNull();
    expect(fromWireOrderBy(undefined)).toBeNull();
  });

  it('translates ASC/DESC to lowercase', () => {
    expect(fromWireOrderBy({ name: 'priority', direction: 'ASC' })).toEqual({ kind: 'property', name: 'priority', direction: 'asc' });
    expect(fromWireOrderBy({ name: 'priority', direction: 'DESC' })).toEqual({ kind: 'property', name: 'priority', direction: 'desc' });
  });

  it('defaults kind to "property" when absent — backward compatible with every already-stored queryBlock', () => {
    expect(fromWireOrderBy({ name: 'priority', direction: 'ASC' })?.kind).toBe('property');
  });

  it('translates an explicit INTRINSIC kind', () => {
    expect(fromWireOrderBy({ kind: 'INTRINSIC', name: 'createdAt', direction: 'DESC' })).toEqual({
      kind: 'intrinsic',
      name: 'createdAt',
      direction: 'desc'
    });
  });
});

describe('WIRE_OPERATORS_BY_DATATYPE', () => {
  it('mirrors the internal operator table in wire (SCREAMING_CASE) form', () => {
    expect([...WIRE_OPERATORS_BY_DATATYPE.text].sort()).toEqual(
      ['CONTAINS', 'EQ', 'EXISTS', 'IN', 'NEQ', 'NOT_EXISTS', 'STARTS_WITH'].sort()
    );
    expect([...WIRE_OPERATORS_BY_DATATYPE.number].sort()).toEqual(
      ['EQ', 'EXISTS', 'GT', 'GTE', 'IN', 'LT', 'LTE', 'NEQ', 'NOT_EXISTS', 'STARTS_WITH'].sort()
    );
    expect([...WIRE_OPERATORS_BY_DATATYPE.boolean].sort()).toEqual(
      ['EQ', 'EXISTS', 'NEQ', 'NOT_EXISTS', 'STARTS_WITH'].sort()
    );
  });

  it('STARTS_WITH is valid for every datatype (name-prefix match, not a value comparison)', () => {
    for (const datatype of ['text', 'url', 'page', 'number', 'date', 'boolean']) {
      expect(WIRE_OPERATORS_BY_DATATYPE[datatype]).toContain('STARTS_WITH');
    }
  });
});

describe('startsWith operator', () => {
  it('is accepted for every datatype and rejects value/values', () => {
    for (const datatype of ['text', 'number', 'date', 'boolean']) {
      expect(() => validateLeafCondition({ name: 'core:', operator: 'startsWith' }, datatype)).not.toThrow();
      expect(() => validateLeafCondition({ name: 'core:', operator: 'startsWith', value: 'x' }, datatype)).toThrow(GraphQLError);
      expect(() => validateLeafCondition({ name: 'core:', operator: 'startsWith', values: ['x'] }, datatype)).toThrow(GraphQLError);
    }
  });
});
