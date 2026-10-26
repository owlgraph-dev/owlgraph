// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Renders a node's content in its own language (docs/architecture/languages.md), not the
// reader's: `fn` runs in Paraglide's server context with the locale swapped, so
// getLocale() and messages need nothing threaded. Outside a request the context
// is created as paraglideMiddleware would.
import { AsyncLocalStorage } from 'node:async_hooks';
import { getServerAsyncLocalStorage, isLocale, overwriteServerAsyncLocalStorage } from '$lib/paraglide/runtime';

type LocaleStore = { locale?: string; origin?: string; messageCalls?: Set<string> };

export async function withContentLocale<T>(locale: string, fn: () => T | Promise<T>): Promise<T> {
  if (!isLocale(locale)) return fn();
  let storage = getServerAsyncLocalStorage() as AsyncLocalStorage<LocaleStore> | undefined;
  if (!storage) {
    storage = new AsyncLocalStorage<LocaleStore>();
    overwriteServerAsyncLocalStorage(storage as never);
  }
  const outer = storage.getStore();
  return storage.run({ origin: outer?.origin, messageCalls: outer?.messageCalls ?? new Set(), locale }, fn);
}
