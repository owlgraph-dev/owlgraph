// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  newIntrinsicRow,
  newTagRow,
  newGroup,
  filterToGroup,
  groupToFilter,
  validateGroup,
  updateGroupItem,
  removeGroupItem,
  appendGroupItem,
  sourceKeyOfRow,
  rowForSourceKey,
  stepFromWire,
  stepToWire,
  type ConditionRow,
  type ConditionGroupDraft
} from './conditionRows';
import type { WireNodeFilter } from './nodeFilter';

// A flat list of rows, through the group tree the builder edits.
const toFilter = (rows: ConditionRow[], combinator: 'and' | 'or' = 'and') => groupToFilter(newGroup(combinator, rows));
const toRows = (filter: WireNodeFilter | null) => {
  const { group, unsupported } = filterToGroup(filter);
  return { rows: group.items as ConditionRow[], combinator: group.combinator, unsupported };
};
const validate = (rows: ConditionRow[]) => validateGroup(newGroup('and', rows));

const datatypeOf = (name: string) => (name === 'core:priority' ? 'number' : 'text');

describe('condition group tree', () => {
  it('filterToGroup() loads a bare leaf as a one-row root group and a flat and/or as its rows', () => {
    const bare = filterToGroup({ property: { name: 'core:status', operator: 'EQ', value: 'done' } });
    expect(bare.unsupported).toBe(0);
    expect(bare.group.items).toHaveLength(1);
    expect(bare.group.items[0]).toMatchObject({ kind: 'property', name: 'core:status' });

    const flat = filterToGroup({ or: [{ property: { name: 'a', operator: 'EQ', value: '1' } }, { intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } }] });
    expect(flat.group.combinator).toBe('or');
    expect(flat.group.items.map((i) => i.kind)).toEqual(['property', 'intrinsic']);
  });

  it('nested and/or round-trips losslessly as nested groups: (A or B) and C', () => {
    const filter: WireNodeFilter = {
      and: [
        { or: [{ property: { name: 'a', operator: 'EQ', value: '1' } }, { property: { name: 'b', operator: 'EQ', value: '2' } }] },
        { tag: { operator: 'HAS_ANY', values: ['x', 'y'] } }
      ]
    };
    const { group, unsupported } = filterToGroup(filter);
    expect(unsupported).toBe(0);
    expect(group.combinator).toBe('and');
    expect(group.items[0]).toMatchObject({ kind: 'group', combinator: 'or' });
    expect((group.items[0] as ConditionGroupDraft).items).toHaveLength(2);
    expect(group.items[1]).toMatchObject({ kind: 'tag', operator: 'HAS_ANY', values: ['x', 'y'] });
    expect(groupToFilter(group)).toEqual(filter);
  });

  it('a single-child group collapses to its child; an empty nested group is dropped; an empty root is null', () => {
    const { group } = filterToGroup({ and: [{ property: { name: 'a', operator: 'EQ', value: '1' } }] });
    expect(groupToFilter(group)).toEqual({ property: { name: 'a', operator: 'EQ', value: '1' } });
    const withEmpty = newGroup('and', [newGroup('or'), { kind: 'property', id: '1', name: 'a', operator: 'EQ', value: '1', valuesText: '' }]);
    expect(groupToFilter(withEmpty)).toEqual({ property: { name: 'a', operator: 'EQ', value: '1' } });
    expect(groupToFilter(newGroup())).toBeNull();
    expect(filterToGroup({ and: [] }).group.items).toEqual([]);
  });

  it('an unknown leaf kind is counted as unsupported rather than silently dropped', () => {
    const { group, unsupported } = filterToGroup({ and: [{ property: { name: 'a', operator: 'EQ', value: '1' } }, { future: {} } as unknown as WireNodeFilter] });
    expect(unsupported).toBe(1);
    expect(group.items).toHaveLength(1);
  });

  it('immutable edits: update/remove/append reach into nested groups and never mutate the input', () => {
    const inner = newGroup('or', [{ kind: 'property', id: 'p1', name: 'a', operator: 'EQ', value: '1', valuesText: '' }], 'g1');
    const root = newGroup('and', [inner], 'root');
    const updated = updateGroupItem(root, 'p1', { kind: 'property', id: 'p1', name: 'a', operator: 'NEQ', value: '2', valuesText: '' });
    expect(((updated.items[0] as ConditionGroupDraft).items[0] as ConditionRow)).toMatchObject({ operator: 'NEQ', value: '2' });
    expect(((root.items[0] as ConditionGroupDraft).items[0] as ConditionRow)).toMatchObject({ operator: 'EQ' });
    const removed = removeGroupItem(root, 'p1');
    expect((removed.items[0] as ConditionGroupDraft).items).toEqual([]);
    const appended = appendGroupItem(root, newTagRow('HAS', 't1'));
    expect(appended.items.map((i) => i.id)).toEqual(['g1', 't1']);
    expect(root.items).toHaveLength(1);
  });

  it('validateGroup() finds a problem inside a nested group', () => {
    const inner = newGroup('or', [{ kind: 'property', id: 'p1', name: 'a', operator: 'EQ', value: '', valuesText: '' }]);
    expect(validateGroup(newGroup('and', [inner]))).toEqual({ code: 'needs-value', name: 'a', operator: 'EQ' });
  });
});

describe('tag rows', () => {
  it('HAS stores one value, the set operators a list; blank chips are dropped', () => {
    expect(toFilter([{ kind: 'tag', id: '1', operator: 'HAS', values: ['Alpha'] }])).toEqual({ tag: { operator: 'HAS', value: 'Alpha' } });
    expect(toFilter([{ kind: 'tag', id: '1', operator: 'HAS_ALL', values: ['a', ' ', 'b'] }])).toEqual({ tag: { operator: 'HAS_ALL', values: ['a', 'b'] } });
  });

  it('round-trips through the group tree', () => {
    const filter: WireNodeFilter = { tag: { operator: 'HAS_NONE', values: ['draft'] } };
    const { rows, unsupported } = toRows(filter);
    expect(unsupported).toBe(0);
    expect(rows).toMatchObject([{ kind: 'tag', operator: 'HAS_NONE', values: ['draft'] }]);
    expect(toFilter(rows)).toEqual(filter);
    expect(toRows({ tag: { operator: 'HAS', value: 'x' } }).rows).toMatchObject([{ kind: 'tag', operator: 'HAS', values: ['x'] }]);
  });

  it('flags a tag row with no tags', () => {
    expect(validate([{ kind: 'tag', id: '1', operator: 'HAS_ANY', values: [] }])).toEqual({ code: 'tag-needs-value', name: 'tag', operator: 'EQ' });
    expect(validate([{ kind: 'tag', id: '1', operator: 'HAS', values: ['x'] }])).toBeNull();
  });
});

describe('source keys', () => {
  it('derive from a row and rebuild a fresh row of the right kind under the same id', () => {
    expect(sourceKeyOfRow({ kind: 'property', id: '1', name: 'core:status', operator: 'EQ', value: '', valuesText: '' })).toBe('prop:core:status');
    expect(sourceKeyOfRow(newIntrinsicRow('CLASS_ID', 'EQ'))).toBe('class');
    expect(sourceKeyOfRow(newIntrinsicRow('TITLE', 'EQ'))).toBe('field:TITLE');
    expect(sourceKeyOfRow(newTagRow())).toBe('tag');
    expect(sourceKeyOfRow({ kind: 'edge', id: '1', type: 'author-of', direction: 'OUTGOING', hasProperty: false, propName: '', propOperator: 'EQ', propValue: '', propValuesText: '' })).toBe('edge:author-of');

    expect(rowForSourceKey('prop:core:priority', datatypeOf, 'id')).toMatchObject({ kind: 'property', id: 'id', name: 'core:priority', operator: 'EQ' });
    expect(rowForSourceKey('field:CREATED_AT', datatypeOf, 'id')).toMatchObject({ kind: 'intrinsic', field: 'CREATED_AT', operator: 'EQ' });
    expect(rowForSourceKey('class', datatypeOf, 'id')).toMatchObject({ kind: 'intrinsic', field: 'CLASS_ID' });
    expect(rowForSourceKey('tag', datatypeOf, 'id')).toMatchObject({ kind: 'tag', operator: 'HAS', values: [] });
    expect(rowForSourceKey('edge:cites', datatypeOf, 'id')).toMatchObject({ kind: 'edge', type: 'cites', direction: 'OUTGOING' });
    expect(rowForSourceKey('nonsense', datatypeOf)).toBeNull();
  });
});

describe('traversal step drafts', () => {
  it('round-trip a step with an edge property and a nested target filter', () => {
    const wire = {
      edge: { type: 'author-of', direction: 'INCOMING' as const, property: { name: 'core:year', operator: 'GT' as const, value: '1990' } },
      targetFilter: { and: [{ intrinsic: { field: 'TYPE' as const, operator: 'EQ' as const, value: 'page' } }, { tag: { operator: 'HAS' as const, value: 'x' } }] },
      repeat: 3
    };
    const { step, unsupported } = stepFromWire(wire);
    expect(unsupported).toBe(0);
    expect(step.edge).toMatchObject({ type: 'author-of', direction: 'INCOMING', hasProperty: true, propName: 'core:year', propOperator: 'GT', propValue: '1990' });
    expect(step.targetGroup?.items).toHaveLength(2);
    expect(stepToWire(step)).toEqual(wire);
  });

  it('a step without a target filter keeps targetFilter null', () => {
    const { step } = stepFromWire({ edge: { type: 'cites', direction: 'OUTGOING' }, targetFilter: null, repeat: 1 });
    expect(step.targetGroup).toBeNull();
    expect(stepToWire(step)).toEqual({ edge: { type: 'cites', direction: 'OUTGOING' }, targetFilter: null, repeat: 1 });
  });
});

describe('intrinsic condition rows', () => {
  it('newIntrinsicRow() seeds an empty row for the given field/operator', () => {
    const row = newIntrinsicRow('TITLE', 'EQ');
    expect(row).toMatchObject({ kind: 'intrinsic', field: 'TITLE', operator: 'EQ', value: '', valuesText: '' });
  });

  it('converts a single intrinsic row to a bare {intrinsic} filter', () => {
    const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'TYPE', operator: 'EQ', value: 'page', valuesText: '' }];
    expect(toFilter(rows)).toEqual({ intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } });
  });

  it('combines an intrinsic row with a property row under the chosen combinator', () => {
    const rows: ConditionRow[] = [
      { kind: 'property', id: '1', name: 'core:status', operator: 'EQ', value: 'done', valuesText: '' },
      { kind: 'intrinsic', id: '2', field: 'TYPE', operator: 'EQ', value: 'page', valuesText: '' }
    ];
    expect(toFilter(rows)).toEqual({
      and: [{ property: { name: 'core:status', operator: 'EQ', value: 'done' } }, { intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } }]
    });
  });

  it('treats the IN operator\'s comma-list value as "values", not "value", for an intrinsic row', () => {
    const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'TYPE', operator: 'IN', value: '', valuesText: 'page, document' }];
    expect(toFilter(rows)).toEqual({ intrinsic: { field: 'TYPE', operator: 'IN', values: ['page', 'document'] } });
  });

  it('round-trips a bare intrinsic filter back to a single row', () => {
    const filter: WireNodeFilter = { intrinsic: { field: 'CREATED_AT', operator: 'GTE', value: '2026-01-01' } };
    const { rows, unsupported } = toRows(filter);
    expect(unsupported).toBe(0);
    expect(rows).toMatchObject([{ kind: 'intrinsic', field: 'CREATED_AT', operator: 'GTE', value: '2026-01-01' }]);
  });

  it('round-trips a flat and/or of property + intrinsic conditions', () => {
    const filter: WireNodeFilter = {
      or: [{ property: { name: 'core:status', operator: 'EQ', value: 'done' } }, { intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } }]
    };
    const { rows, combinator, unsupported } = toRows(filter);
    expect(unsupported).toBe(0);
    expect(combinator).toBe('or');
    expect(rows.map((r) => r.kind)).toEqual(['property', 'intrinsic']);
  });

  it('flags a missing value on an intrinsic EQ row', () => {
    const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'TITLE', operator: 'EQ', value: '', valuesText: '' }];
    expect(validate(rows)).toEqual({ code: 'needs-value', name: 'TITLE', operator: 'EQ' });
  });

  it('flags a missing comma-list on an intrinsic IN row', () => {
    const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'TYPE', operator: 'IN', value: '', valuesText: '  ' }];
    expect(validate(rows)).toEqual({ code: 'in-needs-value', name: 'TYPE', operator: 'IN' });
  });

  it('passes a fully-filled intrinsic row', () => {
    const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'TITLE', operator: 'EQ', value: 'hello', valuesText: '' }];
    expect(validate(rows)).toBeNull();
  });

  it('an EXTERNAL_URL presence row needs no value and stores none', () => {
    const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'EXTERNAL_URL', operator: 'EXISTS', value: '', valuesText: '' }];
    expect(validate(rows)).toBeNull();
    expect(toFilter(rows)).toEqual({ intrinsic: { field: 'EXTERNAL_URL', operator: 'EXISTS' } });
    const { rows: back } = toRows({ intrinsic: { field: 'EXTERNAL_URL', operator: 'NOT_EXISTS' } });
    expect(back).toMatchObject([{ kind: 'intrinsic', field: 'EXTERNAL_URL', operator: 'NOT_EXISTS', value: '' }]);
  });

  describe('class condition rows', () => {
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';

    it('a class row is polymorphic by default: no classMatch is stored, so the wire JSON matches an older block exactly', () => {
      const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'CLASS_ID', operator: 'EQ', value: a, valuesText: '' }];
      expect(toFilter(rows)).toEqual({ intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: a } });
      const isA: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'CLASS_ID', operator: 'EQ', value: a, valuesText: '', classMatch: 'IS_A' }];
      expect(toFilter(isA)).toEqual({ intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: a } });
    });

    it('an "exactly" class row stores classMatch EXACT and round-trips it', () => {
      const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'CLASS_ID', operator: 'EQ', value: a, valuesText: '', classMatch: 'EXACT' }];
      const filter = toFilter(rows);
      expect(filter).toEqual({ intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: a, classMatch: 'EXACT' } });
      const back = toRows(filter);
      expect(back.unsupported).toBe(0);
      expect(back.rows).toMatchObject([{ kind: 'intrinsic', field: 'CLASS_ID', operator: 'EQ', value: a, classMatch: 'EXACT' }]);
    });

    it('classMatch is never emitted for a non-class field', () => {
      const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'TYPE', operator: 'EQ', value: 'page', valuesText: '', classMatch: 'EXACT' }];
      expect(toFilter(rows)).toEqual({ intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } });
    });

    it('an "is any of" class row round-trips its id set through valuesText', () => {
      const filter: WireNodeFilter = { intrinsic: { field: 'CLASS_ID', operator: 'IN', values: [a, b] } };
      const { rows, unsupported } = toRows(filter);
      expect(unsupported).toBe(0);
      expect(rows).toMatchObject([{ kind: 'intrinsic', field: 'CLASS_ID', operator: 'IN', valuesText: `${a}, ${b}` }]);
      expect(toFilter(rows)).toEqual(filter);
    });

    it('still flags a class EQ row with no class picked', () => {
      const rows: ConditionRow[] = [{ kind: 'intrinsic', id: '1', field: 'CLASS_ID', operator: 'EQ', value: '', valuesText: '' }];
      expect(validate(rows)).toEqual({ code: 'needs-value', name: 'CLASS_ID', operator: 'EQ' });
    });
  });
});
