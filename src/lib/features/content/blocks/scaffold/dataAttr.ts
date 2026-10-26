// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A leaf block's attr in a `data-<kebab-name>` attribute, so a copied block
// pastes with its settings. null or undefined writes nothing and reads back as
// the default.

const dataName = (name: string) => `data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export function dataAttr<T>(name: string, fallback: T, parse: (raw: string) => T) {
  const html = dataName(name);
  return {
    default: fallback,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(html);
      return raw === null ? fallback : parse(raw);
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs[name] === null || attrs[name] === undefined ? {} : { [html]: String(attrs[name]) }),
  };
}

/** The same for a structured value, as JSON. */
export function jsonDataAttr<T>(name: string, fallback: T) {
  const html = dataName(name);
  return {
    default: fallback,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(html);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs[name] === null || attrs[name] === undefined ? {} : { [html]: JSON.stringify(attrs[name]) }),
  };
}

export const textValue = (raw: string) => raw;
/** A flag that is on unless it says `false`. */
export const flagValue = (raw: string) => raw !== 'false';
/** A whole number, or null for anything else. */
export const intValue = (raw: string): number | null => (/^\d+$/.test(raw) ? Number(raw) : null);
