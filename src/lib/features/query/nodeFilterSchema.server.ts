// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The MCP tools' zod shapes of a NodeFilter and a TraversalQuery, in the
// internal (not wire) shapes of ./nodeFilter.ts and ./traversal.ts. "Exactly one
// key" is checked by validateFilterShape, so this is a z.lazy(), not a
// discriminated union.
import { z } from 'zod';

const propertyOperatorEnum = z.enum(['eq', 'neq', 'contains', 'exists', 'notExists', 'in', 'gt', 'gte', 'lt', 'lte', 'startsWith']);
export const edgeDirectionEnum = z.enum(['outgoing', 'incoming', 'either']);
const propertyConditionShape = z.object({
  name: z.string(),
  operator: propertyOperatorEnum,
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
});
const edgeConditionShape = z.object({
  type: z.string(),
  direction: edgeDirectionEnum,
  property: propertyConditionShape.optional(),
});
const intrinsicFieldEnum = z.enum(['slug', 'title', 'createdAt', 'updatedAt', 'type', 'namespaceId', 'createdBy', 'classId', 'externalUrl', 'locale']);
const intrinsicConditionShape = z.object({
  field: intrinsicFieldEnum,
  operator: propertyOperatorEnum,
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  // classId only: 'isA' (default — the class and its subclasses) or 'exact'.
  classMatch: z.enum(['isA', 'exact']).optional(),
});
const tagOperatorEnum = z.enum(['has', 'hasAny', 'hasAll', 'hasNone']);
const tagConditionShape = z.object({
  operator: tagOperatorEnum,
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
});
interface NodeFilterShape {
  property?: z.infer<typeof propertyConditionShape>;
  edge?: z.infer<typeof edgeConditionShape>;
  intrinsic?: z.infer<typeof intrinsicConditionShape>;
  tag?: z.infer<typeof tagConditionShape>;
  and?: NodeFilterShape[];
  or?: NodeFilterShape[];
}
// The annotation is load-bearing: TS can't infer a schema that references itself.
const nodeFilterShape: z.ZodType<NodeFilterShape> = z.lazy(() =>
  z.object({
    property: propertyConditionShape.optional(),
    edge: edgeConditionShape.optional(),
    intrinsic: intrinsicConditionShape.optional(),
    tag: tagConditionShape.optional(),
    and: z.array(nodeFilterShape).optional(),
    or: z.array(nodeFilterShape).optional(),
  })
);
const traversalStepShape = z.object({
  edge: edgeConditionShape,
  targetFilter: nodeFilterShape.optional(),
  repeat: z.number().int().min(1).max(5),
});
export const traversalQueryShape = z.object({
  start: z.object({ nodeIds: z.array(z.string()).optional(), filter: nodeFilterShape.optional() }),
  steps: z.array(traversalStepShape),
});
