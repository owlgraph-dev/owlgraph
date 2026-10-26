// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Schema rows the collections feature creates on first use (docs/architecture/semantic-layer.md,
// "Collections"). Named here so the schema's own forms keep them for collections:
// none types an edge with the relationship or defines a property in the group.

/** The relationship from a collection to each of its members. */
export const MEMBERSHIP_RELATIONSHIP = 'contains';

/** The property group of a membership edge's values: its position, its label. */
export const MEMBERSHIP_PROPERTY_GROUP = 'collection';
