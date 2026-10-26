// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Compiles admin-authored custom CSS into the content-scoped stylesheet a scope
// serves (docs/architecture/custom-styles.md). Pure, so the server and the settings page's
// live preview run the same code.
//
// The security boundary: the sheet reaches anonymous viewers, so this module,
// not admin trust, confines every rule to the content root. A named style's
// body must parse as its wrapper rule alone; every selector (nested, or under
// @media/@container/@supports) is rebuilt under the root; the output is
// re-parsed and re-checked (verifyScoped), failing closed. Keyframe names are
// global, so they are namespaced per stylesheet.
import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
// Type-only, so nothing here reaches the feature's client barrel.
import type { StyleKind } from '../types';
import { styleClass } from './slug';
import * as m from '$lib/paraglide/messages';

/**
 * Ancestor-or-self of the blocks container on every surface (public page, share
 * route, both editors, the settings preview), so scoping to it covers editor and
 * public alike. `.prose` is public-only: never scope to it.
 */
export const CONTENT_ROOT = '.page-canvas';

/** The blocks container inside it, whose children are the top-level blocks. */
const BLOCKS_ROOT = '.canvas-blocks';

/**
 * The canvas, for a rule written as `html`, `body` or `:root`. Doubled to
 * (0,2,0) so it beats `app.css`'s own `.page-canvas` rules without
 * `!important` or depending on load order.
 */
const CONTENT_ROOT_SELF = `${CONTENT_ROOT}${CONTENT_ROOT}`;

export type { StyleKind };
export { styleClass };

export interface CssIssue {
  message: string;
  /** 1-based, relative to the CSS the admin wrote. */
  line?: number;
  column?: number;
}

export interface CompileStyle {
  id: string;
  slug: string;
  kind: StyleKind;
  css: string;
  position: number;
}

export interface CompileSheet {
  id: string;
  position: number;
  enabled: boolean;
  freeCss: string;
  styles: CompileStyle[];
}

export interface CompileResult {
  css: string;
  issues: CssIssue[];
}

/** At-rules whose children are ordinary rules, and so are scoped in place. */
const CONDITIONAL_AT_RULES = new Set(['media', 'container', 'supports']);
/** At-rules whose children are keyframe selectors, not element selectors. */
const KEYFRAME_AT_RULES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes', '-o-keyframes']);

// No legitimate use in content, and script-execution vectors in some engines.
const FORBIDDEN_PROPERTIES = new Set(['behavior', '-moz-binding']);

// A compound that means "the document", which inside content means the canvas.
const ROOT_TAGS = new Set(['html', 'body']);

const KEYFRAME_NAME = /^-?[A-Za-z_][\w-]*$/;
const Z_INDEX_KEYWORDS = new Set(['auto', 'inherit', 'initial', 'unset', 'revert']);
const Z_INDEX_MIN = -1;
const Z_INDEX_MAX = 100;

interface Ctx {
  issues: CssIssue[];
  /** Original keyframe name -> namespaced name. */
  keyframes: Map<string, string>;
  out: string[];
  /** Subtracted from reported line numbers, for the named-style wrapper. */
  lineOffset: number;
}

function addIssue(ctx: Ctx, node: { source?: { start?: { line: number; column: number } } }, message: string): void {
  const start = node.source?.start;
  ctx.issues.push(
    start ? { message, line: Math.max(1, start.line - ctx.lineOffset), column: start.column } : { message }
  );
}

interface ScopeOutcome {
  /** The selector to emit, already carrying the content root. */
  selector: string | null;
  error: string | null;
}

/**
 * A top-level selector, rebuilt under the content root. A leading `html`, `body`
 * or `:root` is dropped so the rule lands on the canvas; the prefix is the
 * boundary, so `:is(html, .app-bar)` can still only match inside content.
 */
function scopeTopSelector(selector: string): ScopeOutcome {
  let error: string | null = null;
  let rendered = '';

  try {
    selectorParser((root) => {
      const first = root.nodes[0];
      if (!first) {
        error = m.settings_styles_css_empty_selector();
        return;
      }
      if (root.nodes.length > 1) {
        // Called per selector (rule.selectors): a list means upstream splitting failed.
        error = m.settings_styles_css_selector_list();
        return;
      }

      const sel = first;
      let nesting = false;
      sel.walk((node) => {
        if (node.type === 'nesting') nesting = true;
      });
      if (nesting) {
        error = m.settings_styles_css_top_level_nesting();
        return;
      }

      const leading = sel.nodes.find((node) => !(node.type === 'combinator' && node.value.trim() === ''));
      if (leading?.type === 'combinator') {
        error = m.settings_styles_css_leading_combinator();
        return;
      }

      // Drop leading html/body/:root compounds but keep an explicit combinator
      // after one: `body > .lead` targets a top-level block (see below).
      for (;;) {
        const nodes = sel.nodes;
        let index = 0;
        for (let node = nodes[index]; node?.type === 'combinator' && node.value.trim() === ''; node = nodes[index]) index++;
        const head = nodes[index];
        if (!head || head.type === 'combinator') break;

        let end = index;
        let isRoot = false;
        while (end < nodes.length && nodes[end].type !== 'combinator') {
          const node = nodes[end];
          if (node.type === 'tag' && ROOT_TAGS.has(node.value.toLowerCase())) isRoot = true;
          if (node.type === 'pseudo' && node.value.toLowerCase() === ':root') isRoot = true;
          end++;
        }
        if (!isRoot) break;

        const trailing = nodes[end];
        const removeTrailing = trailing?.type === 'combinator' && trailing.value.trim() === '';
        for (const node of nodes.slice(index, removeTrailing ? end + 1 : end)) node.remove();
      }

      rendered = sel.toString().trim();
    }).processSync(selector, { lossless: false });
  } catch (e) {
    return { selector: null, error: m.settings_styles_css_unreadable_selector({ reason: (e as Error).message }) };
  }

  if (error) return { selector: null, error };
  if (!rendered) return { selector: CONTENT_ROOT_SELF, error: null };
  // A top-level block is a child of the blocks container on every surface.
  if (rendered.startsWith('>')) return { selector: `${CONTENT_ROOT} ${BLOCKS_ROOT} ${rendered}`, error: null };
  return { selector: `${CONTENT_ROOT} ${rendered}`, error: null };
}

/**
 * A nested selector resolved against its already-scoped parents: `&` is
 * substituted, anything else becomes a descendant, so the scope carries through.
 */
function resolveNestedSelector(selector: string, parents: string[]): ScopeOutcome & { selectors?: string[] } {
  const selectors: string[] = [];
  let error: string | null = null;

  for (const parent of parents) {
    try {
      const resolved = selectorParser((root) => {
        let nesting = false;
        root.walk((node) => {
          if (node.type === 'nesting') nesting = true;
        });
        if (nesting) {
          root.walk((node) => {
            if (node.type === 'nesting') node.replaceWith(selectorParser.string({ value: parent }));
          });
        } else {
          for (const sel of root.nodes) {
            sel.prepend(selectorParser.combinator({ value: ' ' }));
            sel.prepend(selectorParser.string({ value: parent }));
          }
        }
      }).processSync(selector, { lossless: false });
      selectors.push(resolved.trim());
    } catch (e) {
      error = m.settings_styles_css_unreadable_selector({ reason: (e as Error).message });
      break;
    }
  }

  return { selector: null, error, selectors };
}

function checkUrlArgument(raw: string): string | null {
  const url = raw.trim();
  if (!url) return m.settings_styles_css_empty_url();
  if (url.startsWith('#')) return null;
  if (url.startsWith('//')) return m.settings_styles_css_url_other_origin({ url });
  if (url.startsWith('/')) return null;
  return m.settings_styles_css_url_not_same_origin({ url });
}

function checkDeclaration(decl: Declaration, ctx: Ctx): void {
  const prop = decl.prop.toLowerCase();
  const value = decl.value.trim();

  if (FORBIDDEN_PROPERTIES.has(prop)) {
    addIssue(ctx, decl, m.settings_styles_css_property_forbidden({ property: decl.prop }));
    return;
  }
  if (prop === 'position' && value.toLowerCase() === 'fixed') {
    addIssue(ctx, decl, m.settings_styles_css_position_fixed());
  }
  if (prop === 'z-index' && !Z_INDEX_KEYWORDS.has(value.toLowerCase())) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < Z_INDEX_MIN || n > Z_INDEX_MAX) {
      addIssue(ctx, decl, m.settings_styles_css_z_index({ min: Z_INDEX_MIN, max: Z_INDEX_MAX }));
    }
  }

  let parsed: valueParser.ParsedValue;
  try {
    parsed = valueParser(decl.value);
  } catch {
    addIssue(ctx, decl, m.settings_styles_css_unreadable_value());
    return;
  }
  parsed.walk((node) => {
    if (node.type !== 'function') return true;
    const fn = node.value.toLowerCase();
    if (fn === 'expression') {
      addIssue(ctx, decl, m.settings_styles_css_expression());
      return false;
    }
    if (fn === 'url') {
      const raw = node.nodes.map((n) => n.value).join('');
      const problem = checkUrlArgument(raw);
      if (problem) addIssue(ctx, decl, problem);
      return false;
    }
    return true;
  });
}

/** The declaration as text, with any reference to a namespaced keyframe rewritten. */
function renderDeclaration(decl: Declaration, ctx: Ctx): string {
  // postcss keeps a custom property's edge whitespace; keep it out of the artifact.
  let value = decl.value.trim();
  const prop = decl.prop.toLowerCase();
  if (ctx.keyframes.size > 0 && (prop === 'animation' || prop === 'animation-name' || prop === '-webkit-animation' || prop === '-webkit-animation-name')) {
    const parsed = valueParser(value);
    parsed.walk((node) => {
      if (node.type !== 'word') return true;
      const renamed = ctx.keyframes.get(node.value);
      if (renamed) node.value = renamed;
      return true;
    });
    value = parsed.toString();
  }
  return `${decl.prop}:${value}${decl.important ? ' !important' : ''}`;
}

function emitBlock(conditions: string[], selectors: string[], declarations: string[], out: string[]): void {
  if (declarations.length === 0 || selectors.length === 0) return;
  let css = `${selectors.join(',')}{${declarations.join(';')}}`;
  for (let i = conditions.length - 1; i >= 0; i--) css = `${conditions[i]}{${css}}`;
  out.push(css);
}

function conditionText(atRule: AtRule, ctx: Ctx): string | null {
  if (atRule.params.includes('{') || atRule.params.includes('}')) {
    addIssue(ctx, atRule, m.settings_styles_css_unreadable_condition({ name: atRule.name }));
    return null;
  }
  return `@${atRule.name} ${atRule.params}`.trim();
}

/** The body of one rule: its declarations, its nested rules, its nested at-rules — flattened. */
function walkRuleBody(container: Container, selectors: string[], conditions: string[], ctx: Ctx): void {
  const declarations: string[] = [];

  for (const node of [...(container.nodes ?? [])] as ChildNode[]) {
    if (node.type === 'decl') {
      checkDeclaration(node, ctx);
      declarations.push(renderDeclaration(node, ctx));
      continue;
    }
    // A block ends the run of declarations before it, so source order survives flattening.
    emitBlock(conditions, selectors, declarations.splice(0), ctx.out);

    if (node.type === 'rule') {
      const { error, selectors: nested } = resolveNestedSelector(node.selector, selectors);
      if (error) {
        addIssue(ctx, node, error);
        continue;
      }
      walkRuleBody(node, nested ?? [], conditions, ctx);
    } else if (node.type === 'atrule') {
      const name = node.name.toLowerCase();
      if (CONDITIONAL_AT_RULES.has(name)) {
        const condition = conditionText(node, ctx);
        if (condition) walkRuleBody(node, selectors, [...conditions, condition], ctx);
      } else if (KEYFRAME_AT_RULES.has(name)) {
        addIssue(ctx, node, m.settings_styles_css_nested_keyframes());
      } else {
        addIssue(ctx, node, m.settings_styles_css_at_rule_here({ name: node.name }));
      }
    }
  }

  emitBlock(conditions, selectors, declarations, ctx.out);
}

function emitKeyframes(atRule: AtRule, conditions: string[], ctx: Ctx): void {
  const renamed = ctx.keyframes.get(atRule.params.trim().replace(/^["']|["']$/g, ''));
  if (!renamed) return; // collectKeyframes already reported why.

  const frames: string[] = [];
  for (const node of [...(atRule.nodes ?? [])] as ChildNode[]) {
    if (node.type === 'comment') continue;
    if (node.type !== 'rule') {
      addIssue(ctx, node, m.settings_styles_css_keyframes_content());
      continue;
    }
    const declarations: string[] = [];
    for (const child of [...(node.nodes ?? [])] as ChildNode[]) {
      if (child.type !== 'decl') {
        addIssue(ctx, child, m.settings_styles_css_keyframe_content());
        continue;
      }
      checkDeclaration(child, ctx);
      declarations.push(renderDeclaration(child, ctx));
    }
    // Keyframe selectors (`from`, `to`, percentages) match no element, so they stay unscoped.
    if (declarations.length > 0) frames.push(`${(node as Rule).selector}{${declarations.join(';')}}`);
  }
  if (frames.length === 0) return;

  let css = `@${atRule.name} ${renamed}{${frames.join('')}}`;
  for (let i = conditions.length - 1; i >= 0; i--) css = `${conditions[i]}{${css}}`;
  ctx.out.push(css);
}

/** The top level of a document: rules define their own selectors, which get scoped. */
function walkTopLevel(container: Container, conditions: string[], ctx: Ctx): void {
  for (const node of [...(container.nodes ?? [])] as ChildNode[]) {
    if (node.type === 'rule') {
      // `html, body` both map onto the canvas; emit it once.
      const seen = new Set<string>();
      const selectors: string[] = [];
      for (const raw of node.selectors) {
        const { selector, error } = scopeTopSelector(raw);
        if (error) addIssue(ctx, node, error);
        else if (selector && !seen.has(selector)) {
          seen.add(selector);
          selectors.push(selector);
        }
      }
      walkRuleBody(node, selectors, conditions, ctx);
    } else if (node.type === 'atrule') {
      const name = node.name.toLowerCase();
      if (CONDITIONAL_AT_RULES.has(name)) {
        const condition = conditionText(node, ctx);
        if (condition) walkTopLevel(node, [...conditions, condition], ctx);
      } else if (KEYFRAME_AT_RULES.has(name)) {
        emitKeyframes(node, conditions, ctx);
      } else {
        addIssue(ctx, node, m.settings_styles_css_at_rule({ name: node.name }));
      }
    } else if (node.type === 'decl') {
      addIssue(ctx, node, m.settings_styles_css_declaration_outside_rule());
    }
  }
}

function collectKeyframes(container: Container, namespace: string, ctx: Ctx): void {
  container.walkAtRules((atRule) => {
    if (!KEYFRAME_AT_RULES.has(atRule.name.toLowerCase())) return;
    const name = atRule.params.trim().replace(/^["']|["']$/g, '');
    if (!KEYFRAME_NAME.test(name)) {
      addIssue(ctx, atRule, m.settings_styles_css_animation_name({ name: atRule.params }));
      return;
    }
    ctx.keyframes.set(name, `cs-${namespace}-${name}`);
  });
}

/**
 * Re-parses the output and proves every rule outside @keyframes is scoped to the
 * content root and no other at-rule survived. A transform bug fails closed here.
 */
function verifyScoped(css: string): string | null {
  let root: postcss.Root;
  try {
    root = postcss.parse(css, { from: undefined });
  } catch (e) {
    return m.settings_styles_css_unreadable_output({ reason: (e as Error).message });
  }

  let problem: string | null = null;
  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    if (!CONDITIONAL_AT_RULES.has(name) && !KEYFRAME_AT_RULES.has(name)) {
      problem ??= m.settings_styles_css_at_rule_survived({ name: atRule.name });
    }
  });
  root.walkRules((rule) => {
    for (let parent: postcss.Container | postcss.Document | undefined = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && KEYFRAME_AT_RULES.has((parent as AtRule).name.toLowerCase())) return;
    }
    for (const selector of rule.selectors) {
      const next = selector[CONTENT_ROOT.length];
      if (!selector.startsWith(CONTENT_ROOT) || (next !== undefined && /[\w-]/.test(next))) {
        problem ??= m.settings_styles_css_escaped_scope({ selector });
        return;
      }
    }
  });
  return problem;
}

function compileDocument(source: string, namespace: string, lineOffset: number, wrapper?: string): CompileResult {
  const ctx: Ctx = { issues: [], keyframes: new Map(), out: [], lineOffset };

  let root: postcss.Root;
  try {
    root = postcss.parse(source, { from: undefined });
  } catch (e) {
    const error = e as postcss.CssSyntaxError;
    return {
      css: '',
      issues: [
        {
          message: error.reason ?? error.message,
          line: error.line === undefined ? undefined : Math.max(1, error.line - lineOffset),
          column: error.column,
        },
      ],
    };
  }

  // A named style's wrapper must be the only rule: postcss reads
  // `color:red } .app-bar {…}` as two rules rather than failing.
  if (wrapper !== undefined) {
    const nodes = (root.nodes ?? []).filter((node) => node.type !== 'comment');
    const only = nodes.length === 1 ? nodes[0] : null;
    if (!only || only.type !== 'rule' || only.selector !== wrapper) {
      return {
        css: '',
        issues: [{ message: m.settings_styles_css_style_braces({ open: '{', close: '}' }) }],
      };
    }
  }

  collectKeyframes(root, namespace, ctx);
  walkTopLevel(root, [], ctx);

  if (ctx.issues.length > 0) return { css: '', issues: ctx.issues };

  const css = ctx.out.join('');
  const escaped = verifyScoped(css);
  if (escaped) return { css: '', issues: [{ message: escaped }] };
  return { css, issues: [] };
}

/**
 * One named style's declaration body, compiled to `.page-canvas .cs-<slug>{…}`.
 * Nested rules and @media/@container are flattened; @keyframes belongs in the
 * stylesheet's free CSS.
 */
export function compileStyleCss(css: string, slug: string): CompileResult {
  if (css.trim() === '') return { css: '', issues: [] };
  // The wrapper carries the class alone, so the content root comes from the one
  // top-level scoping path. The newline keeps columns honest; lineOffset takes it back.
  const wrapper = `.${styleClass(slug)}`;
  return compileDocument(`${wrapper}{\n${css}\n}`, slug, 1, wrapper);
}

/** One stylesheet's free CSS, compiled as a whole document. */
export function compileFreeCss(css: string, namespace: string): CompileResult {
  if (css.trim() === '') return { css: '', issues: [] };
  return compileDocument(css, namespace, 0);
}

/** Identifies what a compile issue belongs to, for reporting it next to its field. */
export type IssueKey = `style:${string}` | `sheet:${string}`;

export interface ArtifactResult {
  css: string;
  issues: Map<IssueKey, CssIssue[]>;
}

/**
 * The artifact for one scope: enabled sheets in `position` order, each its named
 * styles then its free CSS (so free CSS can override a style). A failing entry
 * contributes nothing and reports why; the rest still builds.
 */
export function compileStylesheets(sheets: CompileSheet[]): ArtifactResult {
  const issues = new Map<IssueKey, CssIssue[]>();
  const parts: string[] = [];

  const ordered = [...sheets].filter((sheet) => sheet.enabled).sort((a, b) => a.position - b.position);
  for (const sheet of ordered) {
    const namespace = keyframePrefix(sheet.id);
    for (const style of [...sheet.styles].sort((a, b) => a.position - b.position)) {
      const result = compileStyleCss(style.css, style.slug);
      if (result.issues.length > 0) issues.set(`style:${style.id}`, result.issues);
      else parts.push(result.css);
    }
    const free = compileFreeCss(sheet.freeCss, namespace);
    if (free.issues.length > 0) issues.set(`sheet:${sheet.id}`, free.issues);
    else parts.push(free.css);
  }

  return { css: parts.join(''), issues };
}

/**
 * A short, stable per-sheet namespace for keyframe names, which are global: two
 * sheets' `fade` would collide, and a content `ds-spin` would retarget the Spinner.
 */
export function keyframePrefix(sheetId: string): string {
  return sheetId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'sheet';
}
