// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's id is a UUID: what a route checks before it asks the database
// about an id it was given, so a malformed one is "not found", not an error.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` has the shape of a node id. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
