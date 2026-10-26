// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Pure validation of a traversal spec; traversal.server.ts executes it. Each
// step reuses NodeFilterInput and EdgeConditionInput.
import {
  badInput,
  fromWireFilter,
  fromWireEdgeCondition,
  collectPropertyNames as collectFilterPropertyNames,
  collectEdgeTypes as collectFilterEdgeTypes,
  validateFilterShape,
  type NodeFilterInput,
  type EdgeConditionInput,
  type WireNodeFilter,
  type WireEdgeCondition
} from './nodeFilter';

export interface TraversalStartInput {
  nodeIds?: string[] | null;
  filter?: NodeFilterInput | null;
}

export interface TraversalStepInput {
  edge: EdgeConditionInput;
  targetFilter?: NodeFilterInput | null;
  repeat: number;
}

export interface TraversalQueryInput {
  start: TraversalStartInput;
  steps: TraversalStepInput[];
}

export interface WireTraversalStart {
  nodeIds?: string[] | null;
  filter?: WireNodeFilter | null;
}

export interface WireTraversalStep {
  edge: WireEdgeCondition;
  targetFilter?: WireNodeFilter | null;
  repeat: number;
}

export interface WireTraversalQuery {
  start: WireTraversalStart;
  steps: WireTraversalStep[];
}

export function fromWireTraversalQuery(q: WireTraversalQuery): TraversalQueryInput {
  return {
    start: {
      nodeIds: q.start.nodeIds ?? null,
      filter: q.start.filter ? fromWireFilter(q.start.filter) : null
    },
    steps: q.steps.map((s) => ({
      edge: fromWireEdgeCondition(s.edge),
      targetFilter: s.targetFilter ? fromWireFilter(s.targetFilter) : null,
      repeat: s.repeat
    }))
  };
}

export const MAX_STEP_REPEAT = 5;
export const MAX_STEPS = 5;
// The sum of every step's repeat: many steps each near their own cap would
// otherwise be unbounded in sum.
export const MAX_TOTAL_DEPTH = 10;
export const MAX_HOP_CANDIDATES = 200;
// A step's output across its repeat hops, each of which can add up to
// MAX_HOP_CANDIDATES new nodes.
export const MAX_STEP_ACCUMULATED = 500;
// start.nodeIds' length, and the most nodes a start filter yields.
export const MAX_START_NODE_IDS = 200;

// Runs before any DB work, like validateFilterShape.
export function validateTraversalShape(query: TraversalQueryInput): void {
  const startSet = [query.start.nodeIds, query.start.filter].filter((v) => v != null);
  if (startSet.length !== 1) {
    badInput('exactly one of start.nodeIds or start.filter must be set');
  }
  if (query.start.nodeIds) {
    if (query.start.nodeIds.length === 0) badInput('start.nodeIds must not be empty');
    if (query.start.nodeIds.length > MAX_START_NODE_IDS) {
      badInput(`too many start nodes (max ${MAX_START_NODE_IDS})`);
    }
  }
  if (query.start.filter) validateFilterShape(query.start.filter);

  if (query.steps.length === 0) badInput('steps must not be empty');
  if (query.steps.length > MAX_STEPS) badInput(`too many steps (max ${MAX_STEPS})`);

  let totalDepth = 0;
  for (const step of query.steps) {
    if (!Number.isInteger(step.repeat) || step.repeat < 1 || step.repeat > MAX_STEP_REPEAT) {
      badInput(`step repeat must be an integer between 1 and ${MAX_STEP_REPEAT}`);
    }
    totalDepth += step.repeat;
    if (totalDepth > MAX_TOTAL_DEPTH) badInput(`total traversal depth too large (max ${MAX_TOTAL_DEPTH})`);
    if (step.targetFilter) validateFilterShape(step.targetFilter);
  }
}

export function collectTraversalPropertyNames(query: TraversalQueryInput, out: Set<string> = new Set()): Set<string> {
  if (query.start.filter) collectFilterPropertyNames(query.start.filter, out);
  for (const step of query.steps) {
    if (step.edge.property) out.add(step.edge.property.name);
    if (step.targetFilter) collectFilterPropertyNames(step.targetFilter, out);
  }
  return out;
}

export function collectTraversalEdgeTypes(query: TraversalQueryInput, out: Set<string> = new Set()): Set<string> {
  if (query.start.filter) collectFilterEdgeTypes(query.start.filter, out);
  for (const step of query.steps) {
    out.add(step.edge.type);
    if (step.targetFilter) collectFilterEdgeTypes(step.targetFilter, out);
  }
  return out;
}
