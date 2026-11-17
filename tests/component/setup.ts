// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The app's stylesheet, as the root layout loads it: without the tokens a
// primitive sized by one has no box (docs/guides/testing.md, "Component tests").
import '../../src/app.css';
import { locators, type Locator } from 'vitest/browser';

// `getByCSS(selector)`: a locator that holds to a CSS selector. Vitest turns
// `page.elementLocator(element)` into a selector built from the element's
// text, which stops matching once that text changes.
declare module 'vitest/browser' {
  interface LocatorSelectors {
    getByCSS(selector: string): Locator;
  }
}

locators.extend({
  getByCSS(selector: string) {
    return `css=${selector}`;
  },
});
