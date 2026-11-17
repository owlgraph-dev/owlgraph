// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { ActionResult } from '$app/forms';

/**
 * A form action's result as a test answers it. The test's `$app/forms` mock
 * adds the `location` SvelteKit gives it: the action's path.
 */
export type ActionAnswer = ActionResult extends infer R ? (R extends unknown ? Omit<R, 'location'> : never) : never;
