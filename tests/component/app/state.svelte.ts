// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// `$app/state` for component tests: a plain reactive `page` a test sets up
// before it renders (docs/guides/testing.md, "Component tests").
export const page = $state({
  data: {} as Record<string, unknown>,
  url: new URL('http://localhost/'),
  params: {} as Record<string, string>,
  route: { id: null as string | null },
  status: 200,
  error: null as unknown,
  form: null as unknown,
  state: {} as Record<string, unknown>,
});

export const navigating = $state({ from: null, to: null, type: null, willUnload: false, delta: undefined, complete: null });
export const updated = { current: false, check: async () => false };
